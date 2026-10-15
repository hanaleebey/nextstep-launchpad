// supabase/functions/moodle-sync/index.ts
//
// Pulls courses, assignments, course contents, calendar deadlines and quizzes
// from Moodle using the signed-in user's stored (encrypted) connection, then
// upserts courses + assignments. Read-only towards Moodle.
//
// Request : POST {}   (caller must be signed in)
// Success : { ok: true, partial: boolean, summary: { courses, assignments, items }, warnings: string[], items: Item[] }
// Failure : { ok: false, partial: true, error: { code, message } }   (cached rows are left untouched)
//
// Secrets:
//   MOODLE_TOKEN_KEY  required — same key moodle-connect used to encrypt the token
//   YOUTUBE_API_KEY   optional — without it video durations stay null (estimate.ts uses 20 min)
//
// The token is NEVER logged or returned.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const TIMEOUT_MS = 20_000;
const MAX_RETRIES = 3;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (code: string, message: string, status = 200) =>
  json({ ok: false, partial: true, error: { code, message } }, status);

const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Decrypt "v1:<iv>:<ciphertext>" written by moodle-connect. */
async function decryptToken(stored: string, keyB64: string): Promise<string> {
  const [v, ivB64, ctB64] = stored.split(":");
  if (v !== "v1" || !ivB64 || !ctB64) throw new Error("bad token format");
  const key = await crypto.subtle.importKey("raw", unb64(keyB64), "AES-GCM", false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(ivB64) }, key, unb64(ctB64));
  return new TextDecoder().decode(pt);
}

class MoodleError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

/**
 * One Moodle web-service call. Token goes in the POST body, never the URL.
 * Retries on HTTP 429/5xx and network errors with exponential backoff
 * (honours Retry-After) — this is our rate-limit handling.
 */
async function callMoodle(siteUrl: string, token: string, wsfunction: string, params: Record<string, string> = {}) {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${siteUrl}/webservice/rest/server.php`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ wstoken: token, wsfunction, moodlewsrestformat: "json", ...params }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get("Retry-After"));
        await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 500 * 2 ** attempt);
        lastErr = new MoodleError("SITE_UNREACHABLE", `HTTP ${res.status}`);
        continue;
      }
      if (!res.ok) throw new MoodleError("SITE_UNREACHABLE", `HTTP ${res.status}`);
      const data = await res.json();
      if (data && typeof data === "object" && !Array.isArray(data) && (data.exception || data.errorcode)) {
        const ec = String(data.errorcode ?? "");
        if (ec === "invalidtoken" || ec === "accessexception") throw new MoodleError("INVALID_TOKEN", "Moodle rejected the saved token.");
        throw new MoodleError("MOODLE_ERROR", `${wsfunction}: ${ec || "error"}`);
      }
      return data;
    } catch (err) {
      if (err instanceof MoodleError && err.code !== "SITE_UNREACHABLE") throw err;
      lastErr = err;
      await sleep(500 * 2 ** attempt);
    }
  }
  console.error("moodle-sync: call failed", wsfunction, (lastErr as Error)?.name);
  throw lastErr instanceof MoodleError ? lastErr : new MoodleError("SITE_UNREACHABLE", "Could not reach the Moodle site.");
}

/** Moodle array params: courseids[0]=1&courseids[1]=2 */
const arrayParams = (name: string, ids: (string | number)[]) =>
  Object.fromEntries(ids.map((id, i) => [`${name}[${i}]`, String(id)]));

// ---------------------------------------------------------------- YouTube ----

const YT_RE = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;
export const youtubeId = (url: string | undefined | null) => (url ? url.match(YT_RE)?.[1] ?? null : null);

/** "PT1H18M32S" -> 4712. Returns null when it can't be parsed. */
export function parseIsoDuration(iso: string): number | null {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
  if (!m) return null;
  const [, d, h, mi, s] = m.map((x) => Number(x ?? 0));
  return d * 86400 + h * 3600 + mi * 60 + s;
}

/** Batch lookups, 50 ids per videos.list call. Missing key / failure => null. */
async function resolveYoutubeDurations(ids: string[], warnings: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>(ids.map((id) => [id, null]));
  const key = Deno.env.get("YOUTUBE_API_KEY");
  if (!key || ids.length === 0) {
    if (ids.length && !key) warnings.push("YOUTUBE_API_KEY not set — video durations left empty.");
    return out;
  }
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    try {
      const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${batch.join(",")}&key=${key}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) { warnings.push(`YouTube lookup failed (HTTP ${res.status}).`); continue; }
      const data = await res.json();
      for (const v of data.items ?? []) out.set(v.id, parseIsoDuration(v.contentDetails?.duration ?? ""));
    } catch {
      warnings.push("YouTube lookup failed.");
    }
  }
  return out;
}

// ------------------------------------------------------------------ types ----

type ItemType = "video" | "read" | "quiz" | "paper" | "post";
interface Item {
  lmsCourseId: string;
  cmid: string;
  sectionIndex: number;
  moduleIndex: number;
  modname: string;
  itemType: ItemType;
  title: string;
  url: string | null;
  dueAt: string | null;
  videoDurationSeconds: number | null;
  quizTimeLimitSeconds: number | null;
}

const toIso = (unix: unknown) => (typeof unix === "number" && unix > 0 ? new Date(unix * 1000).toISOString() : null);

function moduleItemType(modname: string, url: string | null): ItemType {
  if (youtubeId(url)) return "video";
  if (modname === "quiz") return "quiz";
  if (modname === "assign") return "paper";
  if (modname === "forum") return "post";
  return "read"; // page, url, resource, book, label...
}

// ------------------------------------------------------------------- main ----

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail("BAD_REQUEST", "Use POST.", 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return fail("UNAUTHENTICATED", "Sign in required.", 401);
  const supabase: SupabaseClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return fail("UNAUTHENTICATED", "Sign in required.", 401);

  const keyB64 = Deno.env.get("MOODLE_TOKEN_KEY");
  if (!keyB64) return fail("NOT_CONFIGURED", "The encryption key is not set on the server.");

  // --- stored connection (RLS scopes it to this user) ------------------------
  const { data: conn, error: connErr } = await supabase
    .from("lms_connections").select("site_url, token_encrypted").eq("provider", "moodle").limit(1).maybeSingle();
  if (connErr) return fail("DB_ERROR", "Could not read your saved connection.");
  if (!conn?.site_url || !conn.token_encrypted) return fail("NOT_CONNECTED", "Connect Moodle first.");

  let token: string;
  try { token = await decryptToken(conn.token_encrypted, keyB64); }
  catch { return fail("TOKEN_UNREADABLE", "Your saved Moodle token can't be read. Reconnect Moodle."); }
  const site = conn.site_url;
  const warnings: string[] = [];
  let partial = false;

  // --- 1. courses (required — without them nothing else is meaningful) ------
  let moodleCourses: Array<{ id: number; fullname: string; shortname: string }>;
  try {
    const info = await callMoodle(site, token, "core_webservice_get_site_info");
    moodleCourses = await callMoodle(site, token, "core_enrol_get_users_courses", { userid: String(info.userid) });
  } catch (err) {
    const e = err as MoodleError;
    return fail(e.code ?? "SITE_UNREACHABLE", `${e.message ?? "Sync failed"} Your previously synced data was kept.`);
  }
  const courseIds = moodleCourses.map((c) => c.id);

  // Each remaining step is independent: a failure marks the sync partial
  // but keeps whatever else succeeded (and the cached rows for the rest).
  const step = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn(); }
    catch (err) { partial = true; warnings.push(`${label} failed: ${(err as Error).message}`); return fallback; }
  };

  // --- 2. assignments -------------------------------------------------------
  const assignData = await step("Assignments", () =>
    callMoodle(site, token, "mod_assign_get_assignments", arrayParams("courseids", courseIds)), { courses: [] });

  // --- 3. course contents (one call per course) -----------------------------
  const contents = new Map<number, Array<{ section: number; modules: Array<Record<string, unknown>> }>>();
  for (const id of courseIds) {
    const c = await step(`Contents for course ${id}`, () =>
      callMoodle(site, token, "core_course_get_contents", { courseid: String(id) }), []);
    contents.set(id, c);
  }

  // --- 4. calendar deadlines (paginated by timesort + aftereventid) ---------
  const events: Array<{ id: number; instance?: number; modulename?: string; timesort: number; course?: { id: number } }> = [];
  await step("Calendar", async () => {
    let after = 0;
    const timesortfrom = String(Math.floor(Date.now() / 1000) - 7 * 86400);
    for (let page = 0; page < 20; page++) {
      const r = await callMoodle(site, token, "core_calendar_get_action_events_by_timesort", {
        timesortfrom, limitnum: "50", ...(after ? { aftereventid: String(after) } : {}),
      });
      const batch = r?.events ?? [];
      events.push(...batch);
      if (batch.length < 50) break;
      after = batch[batch.length - 1].id;
    }
  }, undefined);

  // --- 5. quizzes -----------------------------------------------------------
  const quizData = await step("Quizzes", () =>
    callMoodle(site, token, "mod_quiz_get_quizzes_by_courses", arrayParams("courseids", courseIds)), { quizzes: [] });

  // --- index everything by course module id ---------------------------------
  const assignByCm = new Map<string, { id: number; name: string; duedate: number; intro?: string }>();
  for (const c of assignData.courses ?? []) for (const a of c.assignments ?? []) assignByCm.set(String(a.cmid), a);
  const quizByCm = new Map<string, { id: number; name: string; timeclose: number; timelimit: number }>();
  for (const q of quizData.quizzes ?? []) quizByCm.set(String(q.coursemodule), q);
  const eventDue = new Map<string, number>(); // `${modulename}:${instance}` -> timesort
  for (const e of events) if (e.modulename && e.instance) eventDue.set(`${e.modulename}:${e.instance}`, e.timesort);

  // --- flatten contents into ordered items ----------------------------------
  const items: Item[] = [];
  for (const [courseId, sections] of contents) {
    sections.forEach((sec, sIdx) => {
      (sec.modules ?? []).forEach((m, mIdx) => {
        const modname = String(m.modname ?? "");
        if (modname === "label") return;
        const cmid = String(m.id);
        const contentUrl = (m.contents as Array<{ fileurl?: string }> | undefined)?.[0]?.fileurl ?? null;
        const url = (youtubeId(contentUrl) ? contentUrl : (m.url as string)) ?? contentUrl ?? null;
        const a = assignByCm.get(cmid);
        const q = quizByCm.get(cmid);
        const due =
          (a && toIso(a.duedate)) ||
          (q && toIso(q.timeclose)) ||
          toIso(eventDue.get(`${modname}:${m.instance}`)) ||
          null;
        items.push({
          lmsCourseId: String(courseId), cmid, sectionIndex: sIdx, moduleIndex: mIdx, modname,
          itemType: moduleItemType(modname, url ?? contentUrl),
          title: String(m.name ?? a?.name ?? q?.name ?? "Untitled"),
          url, dueAt: due, videoDurationSeconds: null,
          quizTimeLimitSeconds: q?.timelimit ? q.timelimit : null,
        });
      });
    });
  }

  // --- YouTube durations ----------------------------------------------------
  const ytIds = [...new Set(items.map((i) => youtubeId(i.url)).filter((x): x is string => !!x))];
  const durations = await resolveYoutubeDurations(ytIds, warnings);
  for (const i of items) { const id = youtubeId(i.url); if (id) i.videoDurationSeconds = durations.get(id) ?? null; }

  // --- upsert courses (match on lms_course_id) ------------------------------
  const { data: existingCourses, error: ecErr } = await supabase.from("courses").select("id, lms_course_id");
  if (ecErr) return fail("DB_ERROR", "Could not read cached courses. Your previously synced data was kept.");
  const courseRowId = new Map<string, string>((existingCourses ?? []).map((c) => [c.lms_course_id, c.id]));
  for (const c of moodleCourses) {
    const lmsId = String(c.id);
    const row = { lms_course_id: lmsId, name: c.fullname, code: c.shortname };
    const known = courseRowId.get(lmsId);
    if (known) {
      const { error } = await supabase.from("courses").update(row).eq("id", known);
      if (error) { partial = true; warnings.push(`Course ${c.shortname} not saved.`); }
    } else {
      const { data, error } = await supabase.from("courses").insert(row).select("id").single();
      if (error || !data) { partial = true; warnings.push(`Course ${c.shortname} not saved.`); }
      else courseRowId.set(lmsId, data.id);
    }
  }

  // --- upsert assignments (every schedulable item; match on lms_assignment_id = cmid)
  // Only Moodle-owned fields are written so progress, status and manual
  // estimates in the app are preserved on re-sync.
  const { data: existingAssign, error: eaErr } = await supabase.from("assignments").select("id, lms_assignment_id");
  if (eaErr) return fail("DB_ERROR", "Could not read cached assignments. Your previously synced data was kept.");
  const assignRowId = new Map<string, string>((existingAssign ?? []).map((a) => [a.lms_assignment_id, a.id]));
  let savedAssignments = 0;
  for (const i of items) {
    const course_id = courseRowId.get(i.lmsCourseId);
    if (!course_id) continue;
    const row = { lms_assignment_id: i.cmid, course_id, title: i.title, due_at: i.dueAt };
    const known = assignRowId.get(i.cmid);
    const { data: saved, error } = known
      ? await supabase.from("assignments").update(row).eq("id", known).select("id").maybeSingle()
      : await supabase.from("assignments").insert({ ...row, status: "todo" }).select("id").single();
    if (saved?.id) assignRowId.set(i.cmid, saved.id); // never insert the same Moodle item twice
    if (error) { partial = true; warnings.push(`"${i.title}" not saved.`); }
    else savedAssignments++;
  }

  return json({
    ok: true,
    partial,
    summary: { courses: moodleCourses.length, assignments: savedAssignments, items: items.length },
    warnings,
    items, // ordered; feed into infer-due.ts + estimate.ts on the client
  });
});
