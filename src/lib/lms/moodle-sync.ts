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

/** The browser's only entry point to the developer-deployed moodle-sync function. */
export async function syncMoodle(): Promise<MoodleSyncResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
  const { data, error } = await supabase.functions.invoke("moodle-sync", { body: {}, signal: controller.signal });
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