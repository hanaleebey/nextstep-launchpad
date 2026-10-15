import { beforeEach, describe, expect, it, vi } from "vitest";
import { processMoodleSync } from "./process-sync";
import type { MoodleSyncItem, MoodleSyncResult } from "./moodle-sync";

const mocks = vi.hoisted(() => ({ assignments: vi.fn(), courses: vi.fn(), detected: vi.fn(), log: vi.fn(), replace: vi.fn(), update: vi.fn(), estimate: vi.fn() }));
vi.mock("@/lib/db", () => ({ listAssignments: mocks.assignments, listCourses: mocks.courses, listDetectedItems: mocks.detected, logActivity: mocks.log, replaceDetectedItems: mocks.replace, updateAssignment: mocks.update }));
vi.mock("@/lib/agent/persist-estimate", () => ({ estimateRefineAndPersist: mocks.estimate }));

const item = (cmid: string, course: string, overrides: Partial<MoodleSyncItem> = {}): MoodleSyncItem => ({
  cmid, lmsCourseId: course, sectionIndex: 1, moduleIndex: 1, modname: "page", itemType: "read", title: cmid,
  dueAt: null, url: null, videoDurationSeconds: null, quizTimeLimitSeconds: null, ...overrides,
});
function result(items: MoodleSyncItem[], partial = false): MoodleSyncResult {
  return { ok: true, partial, items, warnings: [], summary: { courses: 2, assignments: items.length, items: items.length } };
}
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-15T00:00:00Z"));
  mocks.courses.mockResolvedValue([{ lms_course_id: "c1", name: "Biology" }]);
  mocks.assignments.mockResolvedValue(["r1", "q1", "r2"].map((id) => ({ id: `a-${id}`, lms_assignment_id: id, due_at: null, estimated_is_manual: false, status: "todo" })));
  mocks.detected.mockResolvedValue([]);
  mocks.replace.mockImplementation(async (rows) => rows);
  mocks.estimate.mockImplementation(async (_id, _type, base) => base);
});

describe("Moodle detection pipeline", () => {
  it("uses raw signals and links estimates to assignments, without anchoring across courses", async () => {
    await processMoodleSync(result([
      item("r1", "c1", { wordCount: 4200 }),
      item("q1", "c1", { sectionIndex: 2, itemType: "quiz", quizTimeLimitSeconds: 600, dueAt: "2026-10-17T18:00:00Z" }),
      item("r2", "c2"),
    ]), "UTC");
    expect(mocks.replace).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ assignment_id: "a-r1", estimated_minutes: 21, signal_value: "4,200 words" }),
      expect.objectContaining({ assignment_id: "a-q1", estimated_minutes: 10, confidence: "high" }),
    ]));
    expect(mocks.replace.mock.calls[0]?.[0]).toHaveLength(2);
    expect(mocks.update).toHaveBeenCalledWith("a-r1", { due_at: "2026-10-17T16:00:00.000Z" });
  });
  it("keeps manual estimates and unreachable cached courses in partial sync", async () => {
    mocks.assignments.mockResolvedValue([{ id: "a-r1", lms_assignment_id: "r1", due_at: null, estimated_is_manual: true, estimated_minutes: 90 }]);
    mocks.detected.mockResolvedValue([{ id: "old", assignment_id: "a-other", item_type: "quiz", title: "Cached quiz", estimated_minutes: 20 }]);
    await processMoodleSync(result([item("r1", "c1", { dueAt: "2026-10-17T18:00:00Z", wordCount: 2000 })], true), "UTC");
    expect(mocks.replace).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ assignment_id: "a-r1", estimated_minutes: 90, estimated_is_manual: true }),
      expect.objectContaining({ assignment_id: "a-other", title: "Cached quiz" }),
    ]));
  });
  it("does not replace cached detection when estimation persistence fails", async () => {
    mocks.estimate.mockRejectedValue(new Error("Save failed"));
    await expect(processMoodleSync(result([item("r1", "c1", { dueAt: "2026-10-17T18:00:00Z" })]), "UTC")).rejects.toThrow("Save failed");
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});