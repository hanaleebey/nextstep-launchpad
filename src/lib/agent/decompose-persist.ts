// Side-effecting half of decomposition: save steps. Kept separate so
// decompose.ts stays pure and easy to test.
import { createSteps, deleteTodoSteps, listSteps } from "@/lib/db";
import type { Step } from "@/types/nextstep";
import { decompose, type DecomposeInput } from "./decompose";

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
