import {
  getAssignment,
  listSteps,
  logActivity,
  setDetectedItemConfirmed,
  updateAssignment,
  updateDetectedItem,
} from "@/lib/db";
import type { DetectedItem } from "@/types/nextstep";
import { persistDecomposition, tailoredSteps } from "./decompose-persist";
import { recomputeBufferStates } from "./buffer";

export interface ConnectPlanSummary {
  assignments: number;
  steps: number;
  firstDeadline: string | null;
  redTitles: string[];
  /** Assignments the planner could not plan. Left unplanned on purpose. */
  failed: number;
}

/**
 * Build steps for every detected item that has none.
 *
 * Steps come from the AI planner, written against each assignment's own
 * description. Generic template steps are never saved: when the planner is
 * unavailable the assignment is left unplanned and counted in `failed`, so the
 * student can retry rather than being handed steps that don't match the work.
 *
 * Existing steps are kept as-is. `rebuildId` forces one assignment to rebuild
 * (used when its estimate was edited).
 */
export async function prepareConnectPlan(items: DetectedItem[], rebuildId?: string): Promise<ConnectPlanSummary> {
  const summary: ConnectPlanSummary = { assignments: 0, steps: 0, firstDeadline: null, redTitles: [], failed: 0 };

  for (const item of items) {
    if (!item.assignment_id) continue;
    const assignment = await getAssignment(item.assignment_id);
    if (!assignment || assignment.status === "done") continue;

    let steps = await listSteps(assignment.id);
    if (!steps.length || rebuildId === assignment.id) {
      const input = {
        title: assignment.title,
        type: item.item_type,
        estimatedMinutes: item.estimated_minutes,
        dueAt: assignment.due_at,
      };
      const planned = await tailoredSteps(input, item.details ?? undefined);
      if (!planned) {
        summary.failed++;
        continue;
      }
      steps = await persistDecomposition(assignment.id, input, planned);
    }

    summary.assignments++;
    summary.steps += steps.length;
    if (assignment.due_at && (!summary.firstDeadline || assignment.due_at < summary.firstDeadline)) {
      summary.firstDeadline = assignment.due_at;
    }
  }

  const buffers = await recomputeBufferStates();
  summary.redTitles = items
    .filter((item) => item.assignment_id && buffers[item.assignment_id]?.state === "red")
    .map((item) => item.title);
  return summary;
}

export async function editDetectedEstimate(item: DetectedItem, minutes: number): Promise<DetectedItem> {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080)
    throw new Error("Enter a whole number between 1 and 10,080 minutes.");
  if (!item.assignment_id) throw new Error("Detect this item again before editing its estimate.");
  await updateAssignment(item.assignment_id, {
    estimated_minutes: minutes,
    estimated_is_manual: true,
    estimate_source: "manual",
  });
  return updateDetectedItem(item.id, { estimated_minutes: minutes, estimated_is_manual: true });
}

/** Mark the detected items as seen. Called automatically once planning finishes. */
export async function confirmConnectPlan(items: DetectedItem[]): Promise<void> {
  for (const item of items) await setDetectedItemConfirmed(item.id, true);
  await logActivity(
    "estimate",
    `Planned ${items.length} detected items; ${items.filter((item) => item.estimated_is_manual).length} estimates adjusted manually.`,
  );
}
