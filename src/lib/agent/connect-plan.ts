import { getAssignment, listSteps, logActivity, setDetectedItemConfirmed, updateAssignment, updateDetectedItem } from "@/lib/db";
import type { DetectedItem } from "@/types/nextstep";
import { persistDecomposition } from "./decompose-persist";
import { recomputeBufferStates } from "./buffer";

export interface ConnectPlanSummary {
  assignments: number;
  steps: number;
  firstDeadline: string | null;
  redTitles: string[];
}

/** Reuse existing steps (including AI steps); only rebuild explicitly edited work. */
export async function prepareConnectPlan(items: DetectedItem[], rebuildId?: string): Promise<ConnectPlanSummary> {
  const summary: ConnectPlanSummary = { assignments: 0, steps: 0, firstDeadline: null, redTitles: [] };
  for (const item of items) {
    if (!item.assignment_id) continue;
    const assignment = await getAssignment(item.assignment_id);
    if (!assignment || assignment.status === "done") continue;
    let steps = await listSteps(assignment.id);
    if (!steps.length || rebuildId === assignment.id) {
      await persistDecomposition(assignment.id, {
        title: assignment.title, type: item.item_type,
        estimatedMinutes: item.estimated_minutes, dueAt: assignment.due_at,
      });
      steps = await listSteps(assignment.id);
    }
    summary.assignments++;
    summary.steps += steps.length;
    if (assignment.due_at && (!summary.firstDeadline || assignment.due_at < summary.firstDeadline)) summary.firstDeadline = assignment.due_at;
  }
  const buffers = await recomputeBufferStates();
  summary.redTitles = items.filter((item) => item.assignment_id && buffers[item.assignment_id]?.state === "red").map((item) => item.title);
  return summary;
}

export async function editDetectedEstimate(item: DetectedItem, minutes: number): Promise<DetectedItem> {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080) throw new Error("Enter a whole number between 1 and 10,080 minutes.");
  if (!item.assignment_id) throw new Error("Detect this item again before editing its estimate.");
  await updateAssignment(item.assignment_id, { estimated_minutes: minutes, estimated_is_manual: true, estimate_source: "manual" });
  return updateDetectedItem(item.id, { estimated_minutes: minutes, estimated_is_manual: true });
}

export async function confirmConnectPlan(items: DetectedItem[]): Promise<void> {
  for (const item of items) await setDetectedItemConfirmed(item.id, true);
  await logActivity("estimate", `Built a plan from ${items.length} detected items; ${items.filter((item) => item.estimated_is_manual).length} estimates adjusted manually.`);
}
