// Completion rules, kept pure so they are testable. The transactional writes
// themselves live in Postgres (complete_step / mark_assignment_done /
// reopen_assignment) so a step and its assignment can never disagree; these
// helpers mirror the same decisions for the views.
import type { LmsStep, LmsStepStatus } from "@/lib/lms/types";

export interface Completable {
  status?: "todo" | "in_progress" | "done" | undefined;
}

/** An assignment is complete exactly when its status is 'done'. */
export function isDone(a: Completable): boolean {
  return a.status === "done";
}

/** Split a list into active work and completed work (order preserved). */
export function partitionByCompletion<T extends Completable>(items: T[]): { active: T[]; completed: T[] } {
  const active: T[] = [];
  const completed: T[] = [];
  for (const item of items) (isDone(item) ? completed : active).push(item);
  return { active, completed };
}

/**
 * progress_pct = round(done steps / total steps * 100). With no steps there is
 * nothing to compute, so the caller's fallback (the saved value) stands.
 */
export function progressFromSteps(steps: Pick<LmsStep, "status">[], fallback: number): number {
  if (steps.length === 0) return fallback;
  const done = steps.filter((s) => s.status === "done").length;
  return Math.round((done / steps.length) * 100);
}

/**
 * True when applying `nextStatus` to the step at `orderIndex` would finish the
 * last open step. An assignment with zero steps is never auto-completed.
 */
export function wouldComplete(
  steps: Pick<LmsStep, "status" | "orderIndex">[],
  orderIndex: number,
  nextStatus: LmsStepStatus,
): boolean {
  if (steps.length === 0) return false;
  return steps.every((s) => (s.orderIndex === orderIndex ? nextStatus : s.status) === "done");
}

/** Prior step statuses, kept in memory so a "Mark done" toast can be undone. */
export interface StepSnapshot {
  id: string;
  status: LmsStepStatus;
}

/** Snapshot every persisted step (demo steps have no id and can't be undone). */
export function snapshotSteps(steps: Pick<LmsStep, "id" | "status">[]): StepSnapshot[] {
  return steps.flatMap((s) => (s.id ? [{ id: s.id, status: s.status }] : []));
}

/** Reopen puts exactly one step back to to-do: the final one. */
export function reopenTargetId(steps: Pick<LmsStep, "id" | "orderIndex">[]): string | null {
  const persisted = steps.flatMap((s) => (s.id ? [{ id: s.id, orderIndex: s.orderIndex }] : []));
  if (persisted.length === 0) return null;
  return persisted.reduce((a, b) => (b.orderIndex > a.orderIndex ? b : a)).id;
}
