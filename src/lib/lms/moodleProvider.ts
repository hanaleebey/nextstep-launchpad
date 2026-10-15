import { listAssignments, listCourses, listDetectedItems, listSteps } from "@/lib/db";
import { connectMoodle } from "./moodle-connect";
import { syncMoodle, type MoodleSyncItem } from "./moodle-sync";
import { setShowingCachedData } from "./provider-state";
import type { Assignment, Course, CourseModule, LmsProvider, SiteInfo } from "./types";

/** Persisted plans are authoritative. A failed Moodle refresh never substitutes demo work. */
export class MoodleProvider implements LmsProvider {
  private refreshing: Promise<void> | null = null;
  private lastAttempt = -Infinity;
  private modules: MoodleSyncItem[] = [];
  private disposed = false;
  private readonly refreshIntervalMs = 5 * 60_000;

  dispose() { this.disposed = true; }

  async validateConnection(siteUrl: string, token: string): Promise<SiteInfo> {
    const result = await connectMoodle(siteUrl, token);
    if (!result.ok) throw new Error(result.message);
    this.lastAttempt = -Infinity;
    return { siteName: result.siteName, siteUrl, userFullName: result.username, userId: String(result.userId) };
  }

  /** Deduplicate refreshes and retry on later reads, not on every assignment request. */
  refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    if (this.disposed || Date.now() - this.lastAttempt < this.refreshIntervalMs) return Promise.resolve();
    this.lastAttempt = Date.now();
    this.refreshing = (async () => {
      try {
        const result = await syncMoodle();
        if (this.disposed) return;
        if (result.items.length) this.modules = result.items;
        setShowingCachedData(!result.ok || result.partial);
      } catch {
        if (!this.disposed) setShowingCachedData(true);
      } finally { this.refreshing = null; }
    })();
    return this.refreshing;
  }

  async getCourses(): Promise<Course[]> {
    let rows = await listCourses();
    // Existing work appears immediately. Only the first, empty import waits for sync.
    if (rows.length) void this.refresh();
    else { await this.refresh(); rows = await listCourses(); }
    // Keep database UUIDs: Execute and the planning engines use these for persistence.
    return rows.map((c) => ({ lmsCourseId: c.id, name: c.name, code: c.code ?? c.name }));
  }

  async getAssignments(courseId: string): Promise<Assignment[]> {
    void this.refresh();
    const [detected, assignments] = await Promise.all([listDetectedItems(), listAssignments()]);
    return Promise.all(assignments.filter((a) => a.course_id === courseId).map(async (a) => ({
      lmsAssignmentId: a.id, lmsCourseId: courseId, title: a.title,
      itemType: detected.find((d) => d.assignment_id === a.id)?.item_type
        ?? this.modules.find((m) => m.cmid === a.lms_assignment_id)?.itemType ?? "paper",
      dueAt: a.due_at, estimatedMinutes: a.estimated_minutes, progressPct: a.progress_pct,
      bufferState: a.buffer_state,
      steps: (await listSteps(a.id)).map((s) => ({ orderIndex: s.order_index, title: s.title,
        timeboxMinutes: s.timebox_minutes, doneCriteria: s.done_criteria, status: s.status })),
    })));
  }

  async getCourseContents(courseId: string): Promise<CourseModule[]> {
    const course = (await listCourses()).find((c) => c.id === courseId);
    const modules = this.modules.filter((m) => m.lmsCourseId === course?.lms_course_id);
    if (modules.length) return modules.map((m) => ({ id: m.cmid, name: m.title, modname: m.modname,
      ...(m.url ? { url: m.url } : {}) }));
    // The schema persists assignments, not full Moodle sections/URLs. Reconstruct
    // available content from those rows when offline or after a page reload.
    return (await this.getAssignments(courseId)).map((a) => ({ id: a.lmsAssignmentId, name: a.title, modname: a.itemType }));
  }
}