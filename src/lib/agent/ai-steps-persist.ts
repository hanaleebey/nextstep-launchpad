// Save AI (or fallback) steps, replacing only not-started steps — same rule
// as persistDecomposition, so finished history is kept.
import { createSteps, deleteTodoSteps, listSteps, logActivity } from "@/lib/db";
import type { DecomposedStep } from "./decompose";

/** True when an assignment has nothing the re-planner could schedule. */
export function hasNoSchedulableSteps(steps: { status: string }[]): boolean {
  return !steps.some((s) => s.status === "todo" || s.status === "blocked");
}

export async function saveGeneratedSteps(assignmentId: string, title: string, steps: DecomposedStep[], source: "ai" | "fallback") {
  const existing = await listSteps(assignmentId);
  const kept = existing.filter((s) => s.status !== "todo");
  await deleteTodoSteps(assignmentId);
  const offset = kept.length ? Math.max(...kept.map((s) => s.order_index)) + 1 : 0;
  const saved = await createSteps(
    steps.map((s) => ({
      assignment_id: assignmentId,
      order_index: offset + s.order_index,
      title: s.title,
      timebox_minutes: s.timebox_minutes,
      done_criteria: s.done_criteria,
    })),
  );
  const total = steps.reduce((n, s) => n + s.timebox_minutes, 0);
  await logActivity({
    kind: "estimate",
    message: `${source === "ai" ? "AI planned" : "Planned"} "${title}": ${steps.length} steps, about ${total} min.`,
  });
  return saved;
}
