// In-memory store for today's Execute session.
// Holds step-status overrides (the mock LMS data is read-only) and a log of
// finished steps for the "Today's session" stats. Lives at module level so it
// survives switching tabs. It is NOT persisted yet: once synced assignments
// live in the database, transitions will go through src/lib/db setStepStatus.
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
}

let state: State = { overrides: {}, finished: [] };
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
    overrides: { ...state.overrides, [entry.key]: entry.status },
    finished: [...state.finished, entry],
  };
  emit();
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
