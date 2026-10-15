// Side-effecting half of decomposition: save steps. Kept separate so
// decompose.ts stays pure and easy to test.
import { createSteps, deleteTodoSteps, listAssignments, listSteps, logActivity } from "@/lib/db";
import type { Step } from "@/types/nextstep";
import { decompose, type DecomposeInput } from "./decompose";
import { recomputeBufferStates } from "./buffer";

/**
 * Generate steps for an assignment and save them.
 * - Steps already done/blocked/stopped are kept as history.
 * - Only not-started ('todo') steps are replaced.
 * - New steps are numbered after any kept ones so order stays unique.
 */
export async function persistDecomposition(assignmentId: string, input: DecomposeInput): Promise<Step[]> {
  const existing = await listSteps(assignmentId);
  const kept = existing.filter((s) => s.status !== "todo");
  await deleteTodoSteps(assignmentId);

  const offset = kept.length ? Math.max(...kept.map((s) => s.order_index)) + 1 : 0;
  const rows = decompose(input).map((s) => ({
    assignment_id: assignmentId,
    order_index: offset + s.order_index,
    title: s.title,
    timebox_minutes: s.timebox_minutes,
    done_criteria: s.done_criteria,
  }));
  return createSteps(rows);
}

/**
 * Plan every saved, unfinished assignment that has no steps at all.
 * Deterministic only (no AI). Assignments that already have steps are untouched.
 * `types` optionally maps assignment id -> item type for better templates.
 */
export async function decomposeAllUnplanned(
  types: Record<string, string> = {},
  onlyIds?: string[],
): Promise<{ assignments: number; steps: number }> {
  const all = (await listAssignments()).filter((a) => a.status !== "done" && (!onlyIds || onlyIds.includes(a.id)));
  let assignments = 0;
  let steps = 0;
  for (const a of all) {
    if ((await listSteps(a.id)).length) continue;
    const created = await persistDecomposition(a.id, {
      title: a.title, type: types[a.id] ?? "paper", estimatedMinutes: a.estimated_minutes, dueAt: a.due_at,
    });
    assignments++;
    steps += created.length;
  }
  if (assignments) {
    await recomputeBufferStates();
    await logActivity("estimate", `Planned ${assignments} assignment(s) into ${steps} timeboxed steps.`);
  }
  return { assignments, steps };
}
