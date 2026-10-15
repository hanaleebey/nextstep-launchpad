// Side-effecting half of decomposition: save steps. Kept separate so
// decompose.ts stays pure and easy to test.
import { createSteps, deleteTodoSteps, listAssignments, listSteps, logActivity } from "@/lib/db";
import type { Step } from "@/types/nextstep";
import { decompose, SHORT_TASK_LIMIT, type DecomposedStep, type DecomposeInput } from "./decompose";
import { planAssignment } from "./agent-estimate-client";
import { stripHtml } from "./estimate";
import { recomputeBufferStates } from "./buffer";

/**
 * Generate steps for an assignment and save them.
 * - Steps already done/blocked/stopped are kept as history.
 * - Only not-started ('todo') steps are replaced.
 * - New steps are numbered after any kept ones so order stays unique.
 */
export async function persistDecomposition(assignmentId: string, input: DecomposeInput, planned?: DecomposedStep[]): Promise<Step[]> {
  const existing = await listSteps(assignmentId);
  const kept = existing.filter((s) => s.status !== "todo");
  await deleteTodoSteps(assignmentId);

  const offset = kept.length ? Math.max(...kept.map((s) => s.order_index)) + 1 : 0;
  const rows = (planned ?? decompose(input)).map((s) => ({
    assignment_id: assignmentId,
    order_index: offset + s.order_index,
    title: s.title,
    timebox_minutes: s.timebox_minutes,
    done_criteria: s.done_criteria,
  }));
  return createSteps(rows);
}

export interface PlanInfo { type?: string; estimatedMinutes?: number | null; description?: string | undefined }

const AI_TIMEOUT_MS = 15_000;

/**
 * Steps tailored to THIS assignment: ask the agent (title, type, description)
 * for longer work; short bounded work and any AI failure use decompose().
 */
async function tailoredSteps(input: DecomposeInput, description?: string): Promise<DecomposedStep[]> {
  const total = input.estimatedMinutes ?? 0;
  if (total > 0 && total < SHORT_TASK_LIMIT && input.type !== "paper") return decompose(input);
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), AI_TIMEOUT_MS));
  const ai = await Promise.race([
    planAssignment({ title: input.title, type: input.type, due_at: input.dueAt,
      description: stripHtml(description).slice(0, 4000) || undefined, estimated_minutes: input.estimatedMinutes }).catch(() => null),
    timeout,
  ]);
  return ai?.steps?.length ? ai.steps : decompose(input);
}

/** Rebuild the not-started steps of one assignment (finished steps are kept). */
export async function regenerateSteps(assignmentId: string, info: PlanInfo = {}): Promise<Step[]> {
  const a = (await listAssignments()).find((x) => x.id === assignmentId);
  if (!a) throw new Error("Assignment not found.");
  const input = { title: a.title, type: info.type ?? "paper", estimatedMinutes: info.estimatedMinutes ?? a.estimated_minutes, dueAt: a.due_at };
  const steps = await persistDecomposition(a.id, input, await tailoredSteps(input, info.description));
  await recomputeBufferStates();
  await logActivity("estimate", `Rebuilt steps for "${a.title}".`);
  return steps;
}

/**
 * Plan every saved, unfinished assignment that has no steps at all.
 * Uses tailored AI steps when available, deterministic otherwise. Assignments that already have steps are untouched.
 * `types` optionally maps assignment id -> item type for better templates.
 */
export async function decomposeAllUnplanned(
  info: Record<string, PlanInfo> = {},
  onlyIds?: string[],
): Promise<{ assignments: number; steps: number }> {
  const all = (await listAssignments()).filter((a) => a.status !== "done" && (!onlyIds || onlyIds.includes(a.id)));
  let assignments = 0;
  let steps = 0;
  for (const a of all) {
    if ((await listSteps(a.id)).length) continue;
    const i = info[a.id] ?? {};
    const input = { title: a.title, type: i.type ?? "paper", estimatedMinutes: i.estimatedMinutes ?? a.estimated_minutes, dueAt: a.due_at };
    const created = await persistDecomposition(a.id, input, await tailoredSteps(input, i.description));
    assignments++;
    steps += created.length;
  }
  if (assignments) {
    await recomputeBufferStates();
    await logActivity("estimate", `Planned ${assignments} assignment(s) into ${steps} timeboxed steps.`);
  }
  return { assignments, steps };
}
