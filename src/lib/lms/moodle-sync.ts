import { supabase } from "@/integrations/supabase/client";
import { setShowingCachedData } from "./provider-state";

export type SyncedItemType = "video" | "read" | "quiz" | "paper" | "post";

export interface MoodleSyncItem {
  lmsCourseId: string;
  cmid: string;
  sectionIndex: number;
  moduleIndex: number;
  modname: string;
  itemType: SyncedItemType;
  title: string;
  url: string | null;
  dueAt: string | null;
  videoDurationSeconds: number | null;
  quizTimeLimitSeconds: number | null;
  wordCount?: number | null;
  questionCount?: number | null;
  targetWords?: number | null;
  introHtml?: string | null;
  rubric?: string[];
}

export interface MoodleSyncResult {
  ok: boolean;
  partial: boolean;
  summary: { courses: number; assignments: number; items: number };
  warnings: string[];
  items: MoodleSyncItem[];
}

async function currentAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return null;
  // Refresh tokens that expire within the next minute.
  if (session.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed.session?.access_token ?? null;
  }
  return session.access_token;
}

function invokeSync(token: string, signal: AbortSignal) {
  return supabase.functions.invoke("moodle-sync", {
    body: {},
    signal,
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** The browser's only entry point to the developer-deployed moodle-sync function. */
export async function syncMoodle(): Promise<MoodleSyncResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
  // The function rejects calls without a valid signed-in session (401). Make
  // sure we send a fresh user token, refreshing once if it has expired.
  const token = await currentAccessToken();
  if (!token) throw new Error("not signed in");
  let { data, error } = await invokeSync(token, controller.signal);
  if (error && (error as { context?: Response }).context?.status === 401) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    const retryToken = refreshed.session?.access_token;
    if (!retryToken) throw new Error("not signed in");
    ({ data, error } = await invokeSync(retryToken, controller.signal));
  }
  if (error) throw new Error("Moodle sync could not finish. Your previously saved work is unchanged.");
  if (!data || !Array.isArray(data.items) || !data.summary) {
    throw new Error("Moodle returned an unexpected sync response. Try again in a moment.");
  }
  const result = {
    ok: data.ok === true,
    partial: data.partial === true,
    summary: data.summary,
    warnings: Array.isArray(data.warnings) ? data.warnings.filter((v: unknown): v is string => typeof v === "string") : [],
    items: data.items,
  };
  setShowingCachedData(!result.ok || result.partial);
  return result;
  } catch {
    setShowingCachedData(true);
    throw new Error("Moodle sync could not finish. Your previously saved work is unchanged.");
  } finally { clearTimeout(timeout); }
}