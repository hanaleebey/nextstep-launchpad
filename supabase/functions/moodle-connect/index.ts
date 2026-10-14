// supabase/functions/moodle-connect/index.ts
//
// Validates a Moodle web-services token and stores the connection.
//
// Request : POST { siteUrl: string, token: string }   (caller must be signed in)
// Success : { ok: true, siteName, username, userId }
// Failure : { ok: false, error: { code, message } }
//   codes: UNAUTHENTICATED | BAD_REQUEST | INVALID_TOKEN | WEB_SERVICES_DISABLED
//          | SITE_UNREACHABLE | NOT_CONFIGURED | MOODLE_ERROR | DB_ERROR
//
// Secrets (supabase secrets set ...):
//   MOODLE_TOKEN_KEY  required — base64 of 32 random bytes (openssl rand -base64 32)
//   SUPABASE_URL / SUPABASE_ANON_KEY are provided automatically.
//
// The token is NEVER logged or returned. It is stored AES-256-GCM encrypted as
// "v1:<base64 iv>:<base64 ciphertext>".

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const TIMEOUT_MS = 15_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
function fail(code: string, message: string, status = 200): Response {
  return json({ ok: false, error: { code, message } }, status);
}

/** Normalise the site URL: require http(s), drop trailing slashes. */
function normaliseSiteUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return `${u.origin}${u.pathname}`.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** AES-256-GCM encrypt with a fresh random IV. */
async function encryptToken(token: string, keyB64: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", unb64(keyB64), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token)),
  );
  return `v1:${b64(iv)}:${b64(ct)}`;
}

/** Map Moodle's error payload to one of our clear error codes. */
function classifyMoodleError(e: { errorcode?: string; exception?: string; message?: string }) {
  const code = e.errorcode ?? "";
  if (code === "invalidtoken" || code === "accessexception")
    return fail("INVALID_TOKEN", "Moodle rejected the token. Check it and try again.");
  if (code === "enablewsdescription" || code === "webservicesnotenabled" || code === "servicenotavailable")
    return fail("WEB_SERVICES_DISABLED", "Web services are turned off on this Moodle site. Ask your admin to enable them.");
  return fail("MOODLE_ERROR", `Moodle returned an error (${code || "unknown"}).`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail("BAD_REQUEST", "Use POST.", 405);

  // --- auth ----------------------------------------------------------------
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return fail("UNAUTHENTICATED", "Sign in required.", 401);
  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return fail("UNAUTHENTICATED", "Sign in required.", 401);

  // --- input ---------------------------------------------------------------
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("BAD_REQUEST", "Request body must be JSON.", 400);
  }
  const siteUrl = normaliseSiteUrl(body.siteUrl);
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!siteUrl) return fail("BAD_REQUEST", "siteUrl must be a valid http(s) URL.", 400);
  if (!token) return fail("BAD_REQUEST", "token is required.", 400);

  const keyB64 = Deno.env.get("MOODLE_TOKEN_KEY");
  if (!keyB64) return fail("NOT_CONFIGURED", "The encryption key is not set on the server.");

  // --- call Moodle (token goes in the POST body, never the URL) -------------
  let info: Record<string, unknown>;
  try {
    const res = await fetch(`${siteUrl}/webservice/rest/server.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        wstoken: token,
        wsfunction: "core_webservice_get_site_info",
        moodlewsrestformat: "json",
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 403 || res.status === 404)
      return fail("WEB_SERVICES_DISABLED", "This site does not expose Moodle web services.");
    if (!res.ok) return fail("SITE_UNREACHABLE", `The Moodle site answered with HTTP ${res.status}.`);
    try {
      info = await res.json();
    } catch {
      return fail("WEB_SERVICES_DISABLED", "The site did not return Moodle web-service data. Is this the right URL?");
    }
  } catch (err) {
    const name = (err as { name?: string })?.name;
    // Log only the error type and host — never the token.
    console.error("moodle-connect: fetch failed", name, new URL(siteUrl).host);
    return fail("SITE_UNREACHABLE", name === "TimeoutError" ? "The Moodle site took too long to answer." : "Could not reach the Moodle site.");
  }

  if (info && (info.exception || info.errorcode)) return classifyMoodleError(info as never);
  if (!info?.sitename || info.userid == null)
    return fail("MOODLE_ERROR", "Unexpected reply from Moodle.");

  // --- encrypt + upsert (one Moodle connection per user) --------------------
  const token_encrypted = await encryptToken(token, keyB64);
  const row = { provider: "moodle", site_url: siteUrl, token_encrypted, connected_at: new Date().toISOString() };

  const { data: existing, error: selErr } = await supabase
    .from("lms_connections").select("id").eq("provider", "moodle").limit(1).maybeSingle();
  if (selErr) return fail("DB_ERROR", "Could not read your saved connection.");

  const { error: writeErr } = existing
    ? await supabase.from("lms_connections").update(row).eq("id", existing.id)
    : await supabase.from("lms_connections").insert(row); // user_id defaults to auth.uid()
  if (writeErr) {
    console.error("moodle-connect: db write failed", writeErr.code);
    return fail("DB_ERROR", "Could not save the connection.");
  }

  return json({
    ok: true,
    siteName: String(info.sitename),
    username: String(info.username ?? ""),
    userId: String(info.userid),
  });
});
