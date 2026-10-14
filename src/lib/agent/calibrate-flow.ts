// Glue between the Execute view and calibration.
// Pure helpers (sampleFromCompletion, kindForLmsType) + one side-effecting
// entry point (saveCompletionSample) so the view stays thin.
import { listAssignments } from "@/lib/db";
import type { LmsItemType } from "@/lib/lms/types";
import { calibrationTypeFor, type EstimateInput } from "./estimate";
import type { Sample } from "./calibrate";
import { recalibrate, recordSample } from "./calibrate-persist";

/** LMS item type -> estimate kind. Papers and posts are writing. */
export function kindForLmsType(t: LmsItemType | string): EstimateInput["kind"] {
  switch (t) {
    case "video": return "video";
    case "read": return "read";
    case "quiz": return "quiz";
    case "paper": case "post": return "writing";
    default: return "other";
  }
}

/**
 * Build the calibration sample for a finished step, or null when the type
 * isn't calibrated. A timer that never started gives actual_minutes = null
 * (never 0 — 0 would look like "finished instantly").
 */
export function sampleFromCompletion(itemType: string, timeboxMinutes: number, elapsedSeconds: number, timerStarted: boolean): Sample | null {
  const type = calibrationTypeFor(kindForLmsType(itemType));
  if (!type) return null;
  return {
    item_type: type,
    estimated_minutes: timeboxMinutes,
    actual_minutes: timerStarted ? elapsedSeconds / 60 : null,
  };
}

/**
 * Record one sample and recalibrate. Returns the plain-language messages to show,
 * or a note when the step isn't tied to a saved assignment (sample data).
 */
export async function saveCompletionSample(lmsAssignmentId: string, sample: Sample): Promise<{ saved: boolean; messages: string[] }> {
  // Execute's ids are LMS ids; estimate_events needs the saved assignment's id.
  const match = (await listAssignments()).find((a) => a.lms_assignment_id === lmsAssignmentId || a.id === lmsAssignmentId);
  if (!match) return { saved: false, messages: [] };
  await recordSample(match.id, sample);
  const { messages } = await recalibrate();
  return { saved: true, messages };
}
