// Completion rules: one source of truth (status = 'done'), active/completed
// partitioning, progress sync, undo snapshots and the reopen target. The
// transactional writes themselves are Postgres RPCs; these tests pin the
// mirrored decisions the views make.
import { describe, expect, it } from "vitest";
import {
  isDone, partitionByCompletion, progressFromSteps, reopenTargetId, snapshotSteps, wouldComplete,
} from "./completion";

const step = (orderIndex: number, status: "todo" | "done" | "blocked" | "stopped", id?: string) =>
  ({ orderIndex, status, ...(id ? { id } : {}) });

describe("isDone / partitionByCompletion", () => {
  it("treats only status 'done' as complete; undefined (demo) stays active", () => {
    expect(isDone({ status: "done" })).toBe(true);
    expect(isDone({ status: "in_progress" })).toBe(false);
    expect(isDone({})).toBe(false);
  });

  it("excludes completed assignments from the active list and counts", () => {
    const rows = [
      { title: "a", status: "done" as const },
      { title: "b", status: "todo" as const },
      { title: "c" }, // demo row, no status
    ];
    const { active, completed } = partitionByCompletion(rows);
    expect(active.map((r) => r.title)).toEqual(["b", "c"]);
    expect(completed.map((r) => r.title)).toEqual(["a"]);
  });
});

describe("progressFromSteps", () => {
  it("is 100 when every step is done", () => {
    expect(progressFromSteps([step(0, "done"), step(1, "done")], 0)).toBe(100);
  });

  it("rounds done/total and keeps the fallback when there are no steps", () => {
    expect(progressFromSteps([step(0, "done"), step(1, "todo"), step(2, "done")], 0)).toBe(67);
    expect(progressFromSteps([], 42)).toBe(42);
  });
});

describe("wouldComplete", () => {
  it("is true when the last open step is marked done", () => {
    const steps = [step(0, "done"), step(1, "todo")];
    expect(wouldComplete(steps, 1, "done")).toBe(true);
  });

  it("is false while other steps remain open or the step is only stopped", () => {
    const steps = [step(0, "todo"), step(1, "todo")];
    expect(wouldComplete(steps, 1, "done")).toBe(false);
    expect(wouldComplete([step(0, "todo")], 0, "stopped")).toBe(false);
  });

  it("never auto-completes an assignment with zero steps", () => {
    expect(wouldComplete([], 0, "done")).toBe(false);
  });
});

describe("snapshotSteps (undo)", () => {
  it("captures the exact prior statuses of every persisted step", () => {
    const steps = [step(0, "done", "s1"), step(1, "blocked", "s2"), step(2, "stopped", "s3"), step(3, "todo")];
    expect(snapshotSteps(steps)).toEqual([
      { id: "s1", status: "done" },
      { id: "s2", status: "blocked" },
      { id: "s3", status: "stopped" },
    ]);
  });
});

describe("reopenTargetId", () => {
  it("picks the final persisted step so reopen leaves exactly one step open", () => {
    const steps = [step(0, "done", "s1"), step(2, "done", "s3"), step(1, "done", "s2")];
    expect(reopenTargetId(steps)).toBe("s3");
  });

  it("returns null when nothing is persisted (demo data)", () => {
    expect(reopenTargetId([step(0, "done")])).toBeNull();
  });
});
