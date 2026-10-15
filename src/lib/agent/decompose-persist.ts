// Side-effecting half of decomposition: save steps. Kept separate so
// decompose.ts stays pure and easy to test.
import { createSteps, deleteTodoSteps, listAssignments, listSteps, logActivity } from "@/lib/db";
import type { Step } from "@/types/nextstep";
import { decompose, type DecomposedStep, type DecomposeInput } from "./decompose";
import { planAssignment } from "./agent-estimate-client";
import { stripHtml } from "./estimate";
import { recomputeBufferStates } from "./buffer";

/**
 * Generate steps for an assignment and save them.
 * - Steps already done/blocked/stopped are kept as history.
 * - Only not-started ('todo') steps are replaced.
 * - New steps are numbered after any kept ones so order stays unique.
 */
export async function persistDecomposition(
  assignmentId: string,
  input: DecomposeInput,
  planned?: DecomposedStep[],
): Promise<Step[]> {
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

export interface PlanInfo {
  type?: string;
  estimatedMinutes?: number | null;
  description?: string | undefined;
}

/** Budget for one planning call. Must exceed the function's retry budget
 *  (3 attempts x 15s + backoff), or the client gives up mid-retry. */
const AI_TIMEOUT_MS = 40_000;

/** The real reason the last AI planning attempt failed (shown in the UI). */
export let lastAiError: string | null = null;

/**
 * Steps tailored to THIS assignment, written by the agent from its title,
 * type and Moodle description. No generic templates are ever saved:
 *  - A video with no extra instructions is simply one "Watch" step (exact minutes).
 *  - Everything else goes to the agent; if it is unavailable we return null
 *    and the assignment stays unplanned so the student can retry.
 */
export async function tailoredSteps(input: DecomposeInput, description?: string): Promise<DecomposedStep[] | null> {
  const details = stripHtml(description).slice(0, 4000);
  const isVideo = ["video", "lecture"].includes(input.type.toLowerCase());
  if (isVideo && details.length < 40) {
    const minutes = Math.max(1, Math.round(input.estimatedMinutes ?? 20));
    return [
      {
        order_index: 0,
        title: `Watch "${input.title.trim()}"`,
        timebox_minutes: Math.min(50, minutes),
        done_criteria: ["Watched to the end"],
      },
    ];
  }
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), AI_TIMEOUT_MS));
  const ai = await Promise.race([
    planAssignment({
      title: input.title,
      type: input.type,
      due_at: input.dueAt,
      description: details || undefined,
      estimated_minutes: input.estimatedMinutes,
    }).catch((e) => {
      lastAiError = e instanceof Error ? e.message : "AI unavailable";
      return null;
    }),
    timeout,
  ]);
  if (ai && ai.source === "ai" && ai.steps.length) {
    lastAiError = null;
    return ai.steps;
  }
  // Keep the server's exact message (or a timeout note) so the UI can show it.
  lastAiError = ai === null ? "The AI planner took too long to answer." : (ai.note ?? "AI unavailable");
  return null;
}

/** Rebuild the not-started steps of one assignment (finished steps are kept). */
export async function regenerateSteps(assignmentId: string, info: PlanInfo = {}): Promise<Step[]> {
  const a = (await listAssignments()).find((x) => x.id === assignmentId);
  if (!a) throw new Error("Assignment not found.");
  const input = {
    title: a.title,
    type: info.type ?? "paper",
    estimatedMinutes: info.estimatedMinutes ?? a.estimated_minutes,
    dueAt: a.due_at,
  };
  const planned = await tailoredSteps(input, info.description);
  if (!planned)
    throw new Error(
      `The AI planner is unavailable right now (${lastAiError ?? "unknown reason"}). Nothing was changed — try again shortly.`,
    );
  const steps = await persistDecomposition(a.id, input, planned);
  await recomputeBufferStates();
  await logActivity("estimate", `Rebuilt steps for "${a.title}".`);
  return steps;
}

/**
 * Plan every saved, unfinished assignment that has no steps at all, using
 * assignment-specific AI steps. Assignments the agent couldn't plan are
 * left unplanned (counted in `failed`) instead of getting template steps.
 */
export async function decomposeAllUnplanned(
  info: Record<string, PlanInfo> = {},
  onlyIds?: string[],
): Promise<{ assignments: number; steps: number; failed: number }> {
  const all = (await listAssignments()).filter((a) => a.status !== "done" && (!onlyIds || onlyIds.includes(a.id)));
  let assignments = 0;
  let steps = 0;
  let failed = 0;
  for (const a of all) {
    if ((await listSteps(a.id)).length) continue;
    const i = info[a.id] ?? {};
    const input = {
      title: a.title,
      type: i.type ?? "paper",
      estimatedMinutes: i.estimatedMinutes ?? a.estimated_minutes,
      dueAt: a.due_at,
    };
    const planned = await tailoredSteps(input, i.description);
    if (!planned) {
      failed++;
      continue;
    }
    const created = await persistDecomposition(a.id, input, planned);
    assignments++;
    steps += created.length;
  }
  if (assignments) {
    await recomputeBufferStates();
    await logActivity("estimate", `Planned ${assignments} assignment(s) into ${steps} assignment-specific steps.`);
  }
  return { assignments, steps, failed };
}
