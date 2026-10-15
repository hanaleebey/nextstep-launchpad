import { beforeEach, describe, expect, it, vi } from "vitest";
import { MoodleProvider } from "./moodleProvider";
import { MockProvider } from "./mockProvider";
import { configureLmsConnection, getLmsProvider, resetLmsProvider } from "./index";
import { getProviderState, loadDemoPreference, setUseDemoData } from "./provider-state";

const mocks = vi.hoisted(() => ({ connection: vi.fn(), courses: vi.fn(), assignments: vi.fn(), detected: vi.fn(), steps: vi.fn(), sync: vi.fn(), connect: vi.fn() }));
vi.mock("@/lib/db", () => ({ getLmsConnection: mocks.connection, listCourses: mocks.courses,
  listAssignments: mocks.assignments, listDetectedItems: mocks.detected, listSteps: mocks.steps }));
vi.mock("./moodle-sync", () => ({ syncMoodle: mocks.sync }));
vi.mock("./moodle-connect", () => ({ connectMoodle: mocks.connect }));

const success = { ok: true, partial: false, items: [], warnings: [], summary: { courses: 1, assignments: 1, items: 1 } };
beforeEach(() => {
  vi.clearAllMocks(); resetLmsProvider(); localStorage.clear();
  mocks.connection.mockResolvedValue({ id: "connection", site_url: "https://moodle.example.edu" });
  mocks.courses.mockResolvedValue([{ id: "course-db", lms_course_id: "42", name: "Psychology", code: "PSY" }]);
  mocks.assignments.mockResolvedValue([{ id: "assignment-db", course_id: "course-db", lms_assignment_id: "73",
    title: "Read memory chapter", due_at: "2026-10-18T10:00:00Z", estimated_minutes: 21, progress_pct: 25, buffer_state: "amber" }]);
  mocks.detected.mockResolvedValue([{ assignment_id: "assignment-db", item_type: "read" }]);
  mocks.steps.mockResolvedValue([{ order_index: 0, title: "Read the introduction", timebox_minutes: 15, done_criteria: ["Read first page"], status: "todo" }]);
  mocks.sync.mockResolvedValue(success);
});

describe("MoodleProvider", () => {
  it("validates through moodle-connect, not the mock validator", async () => {
    mocks.connect.mockResolvedValue({ ok: true, siteName: "University", username: "Student", userId: 8 });
    expect(await new MoodleProvider().validateConnection("https://moodle.example.edu", "test-token"))
      .toEqual({ siteName: "University", siteUrl: "https://moodle.example.edu", userFullName: "Student", userId: "8" });
    expect(mocks.connect).toHaveBeenCalledWith("https://moodle.example.edu", "test-token");
    mocks.connect.mockResolvedValue({ ok: false, message: "Invalid token" });
    await expect(new MoodleProvider().validateConnection("site", "token")).rejects.toThrow("Invalid token");
  });
  it("reads saved plans with database IDs and detected types", async () => {
    const provider = new MoodleProvider();
    expect(await provider.getCourses()).toEqual([{ lmsCourseId: "course-db", name: "Psychology", code: "PSY" }]);
    const rows = await provider.getAssignments("course-db");
    expect(rows[0]).toMatchObject({ lmsAssignmentId: "assignment-db", itemType: "read", bufferState: "amber", estimatedMinutes: 21 });
    expect(rows[0]?.steps?.[0]).toMatchObject({ title: "Read the introduction", status: "todo" });
    expect(await provider.getCourseContents("course-db")).toEqual([{ id: "assignment-db", name: "Read memory chapter", modname: "read" }]);
    expect(mocks.sync).toHaveBeenCalledTimes(1);
  });
  it("returns cache immediately even if Moodle is hanging", async () => {
    mocks.sync.mockImplementation(() => new Promise(() => {}));
    expect(await new MoodleProvider().getCourses()).toHaveLength(1);
  });
  it("serves saved rows on sync failure and marks them cached", async () => {
    mocks.sync.mockRejectedValue(new Error("unreachable"));
    const provider = new MoodleProvider();
    await provider.refresh();
    expect(getProviderState().cached).toBe(true);
    expect(await provider.getCourses()).toHaveLength(1);
    expect(await provider.getAssignments("course-db")).toHaveLength(1);
    expect(mocks.sync).toHaveBeenCalledTimes(1);
  });
  it("flags partial success and clears the notice after recovery", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    const provider = new MoodleProvider();
    mocks.sync.mockResolvedValueOnce({ ...success, partial: true });
    await provider.refresh();
    expect(getProviderState().cached).toBe(true);
    clock.mockReturnValue(301001);
    await provider.refresh();
    expect(getProviderState().cached).toBe(false);
    clock.mockRestore();
  });
  it("re-reads an empty database after first sync", async () => {
    mocks.courses.mockResolvedValueOnce([]);
    expect(await new MoodleProvider().getCourses()).toHaveLength(1);
    // One read finds nothing, the sync runs, the second read returns the new row.
    expect(mocks.courses).toHaveBeenCalledTimes(2);
  });
  it("maps fresh module URLs without losing the saved assignments", async () => {
    mocks.sync.mockResolvedValue({ ...success, items: [{ lmsCourseId: "42", cmid: "73", title: "Read memory chapter", modname: "page", url: "https://moodle.example.edu/page/73" }] });
    const provider = new MoodleProvider();
    await provider.refresh();
    expect(await provider.getCourseContents("course-db")).toEqual([{ id: "73", name: "Read memory chapter", modname: "page", url: "https://moodle.example.edu/page/73" }]);
  });
});

describe("provider selection", () => {
  it("resolves the connection once then returns MoodleProvider", async () => {
    await getLmsProvider().getCourses();
    expect(getLmsProvider()).toBeInstanceOf(MoodleProvider);
    await getLmsProvider().getCourses();
    expect(mocks.connection).toHaveBeenCalledTimes(1);
  });
  it("returns MockProvider with no connection and performs no sync", async () => {
    mocks.connection.mockResolvedValue(null);
    expect(await getLmsProvider().getCourses()).toHaveLength(4);
    expect(getLmsProvider()).toBeInstanceOf(MockProvider);
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("overrides Moodle with demo and restores it without changing saved rows", () => {
    configureLmsConnection({ id: "connection" });
    const real = getLmsProvider();
    loadDemoPreference("student@example.edu");
    setUseDemoData(true);
    expect(getLmsProvider()).toBeInstanceOf(MockProvider);
    setUseDemoData(false);
    expect(getLmsProvider()).toBe(real);
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("scopes persisted preferences to the account", () => {
    loadDemoPreference("student@example.edu"); setUseDemoData(true);
    loadDemoPreference("another@example.edu"); expect(getProviderState().demo).toBe(false);
    loadDemoPreference("student@example.edu"); expect(getProviderState().demo).toBe(true);
    resetLmsProvider(); expect(getProviderState()).toEqual({ demo: false, cached: false });
  });
});