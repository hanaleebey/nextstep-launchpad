// In-memory store for today's Execute session.
// Holds step-status overrides (so demo data, which is read-only, still advances),
// a log of finished steps for "Today's session", and an optional focused
// assignment chosen from the Map's "Open" panel. Persisted steps are also
// written to the database by the Execute view; overrides just make the UI instant.
import { useSyncExternalStore } from "react";
import type { StepStatus } from "@/types/nextstep";

export interface FinishedStep {
  key: string;
  status: StepStatus;
  elapsedSeconds: number;
  timeboxSeconds: number;
}

interface State {
  overrides: Record<string, StepStatus>; // key = `${assignmentId}:${orderIndex}`
  finished: FinishedStep[];
  focusAssignmentId: string | null;
}

let state: State = { overrides: {}, finished: [], focusAssignmentId: null };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function stepKey(assignmentId: string, orderIndex: number): string {
  return `${assignmentId}:${orderIndex}`;
}

/** Record a status transition for a step and log how long it took. */
export function finishStep(entry: FinishedStep) {
  state = {
    ...state,
    overrides: { ...state.overrides, [entry.key]: entry.status },
    finished: [...state.finished, entry],
  };
  emit();
}

/** Ask Execute to work on a specific assignment next (null = back to most urgent). */
export function focusAssignment(id: string | null) {
  state = { ...state, focusAssignmentId: id };
  emit();
}

/** Apply this session's overrides to a list of steps. */
export function withOverrides<T extends { orderIndex: number; status: StepStatus }>(
  assignmentId: string,
  steps: T[],
  overrides: Record<string, StepStatus>,
): T[] {
  return steps.map((s) => ({ ...s, status: overrides[stepKey(assignmentId, s.orderIndex)] ?? s.status }));
}

export function useExecuteSession(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}
