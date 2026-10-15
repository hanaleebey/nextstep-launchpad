import { listAssignments, listCourses, listDetectedItems, listSteps, logActivity, setStepStatus, updateAssignment } from "@/lib/db";
import { connectMoodle } from "./moodle-connect";
import { syncMoodle, type MoodleSyncItem } from "./moodle-sync";
import { notifyLmsDataChanged, setShowingCachedData } from "./provider-state";
import { estimate } from "@/lib/agent/estimate";
import { inputFor } from "./process-sync";
import type { Assignment, Course, CourseModule, LmsProvider, SiteInfo } from "./types";

/**
 * When Moodle reports a different real due date than we had saved, the student
 * "reset" that assignment: clear its progress and set every step back to to-do.
 * Only dates Moodle itself sets are compared (inferred dates are ignored).
 */
async function resetChangedDeadlines(before: Map<string, string | null>, items: MoodleSyncItem[]): Promise<number> {
  const after = await listAssignments();
  let reset = 0;
  for (const a of after) {
    const item = items.find((i) => i.cmid === a.lms_assignment_id);
    if (!item?.dueAt || !before.has(a.id)) continue;
    const old = before.get(a.id);
    if (old && new Date(old).getTime() === new Date(item.dueAt).getTime()) continue;
    if (!old) continue; // first time a date appears: nothing to reset
    const steps = await listSteps(a.id);
    await Promise.all(steps.filter((s) => s.status !== "todo").map((s) => setStepStatus(s.id, "todo")));
    await updateAssignment(a.id, { progress_pct: 0, status: "todo" });
    await logActivity("sync", `Reset progress for "${a.title}" because its due date changed in Moodle.`);
    reset++;
  }
  return reset;
}

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
  refresh(force = false): Promise<void> {
    if (this.refreshing) return this.refreshing;
    if (this.disposed || (!force && Date.now() - this.lastAttempt < this.refreshIntervalMs)) return Promise.resolve();
    this.lastAttempt = Date.now();
    this.refreshing = (async () => {
      try {
        const before = new Map((await listAssignments()).map((a) => [a.id, a.due_at]));
        const result = await syncMoodle();
        if (this.disposed) return;
        if (result.items.length) this.modules = result.items;
        await resetChangedDeadlines(before, result.items);
        setShowingCachedData(!result.ok || result.partial);
        notifyLmsDataChanged(); // views refetch so new due dates show without reload
      } catch (e) {
        if (!this.disposed) setShowingCachedData(true);
        if (force) throw e;
      } finally { this.refreshing = null; }
    })();
    return this.refreshing;
  }

  /** Manual "Sync with Moodle": skip the cooldown and report failures. */
  syncNow(): Promise<void> { return this.refresh(true); }

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
    const withSteps = await Promise.all(assignments.filter((a) => a.course_id === courseId).map(async (a) => ({ a, steps: await listSteps(a.id) })));
    // Deduplicate: one card per Moodle item (or per title when no Moodle id). Keep the row with the most progress.
    const best = new Map<string, (typeof withSteps)[number]>();
    for (const r of withSteps) {
      const key = r.a.lms_assignment_id ?? `title:${r.a.title.trim().toLowerCase()}`;
      const cur = best.get(key);
      const score = (x: typeof r) => x.steps.filter((s) => s.status !== "todo").length * 1000 + x.steps.length;
      if (!cur || score(r) > score(cur)) best.set(key, r);
    }
    return [...best.values()].map(({ a, steps }) => {
      const module = this.modules.find((m) => m.cmid === a.lms_assignment_id);
      const itemType = detected.find((d) => d.assignment_id === a.id)?.item_type ?? module?.itemType ?? "paper";
      // Hard (signal) estimate from Moodle data when it is better than what's saved.
      const signal = module ? estimate(inputFor(module)) : null;
      const estimatedMinutes = a.estimated_is_manual ? a.estimated_minutes
        : signal && signal.confidence !== "low" && module?.itemType !== "paper" ? signal.minutes : a.estimated_minutes ?? signal?.minutes ?? null;
      return {
        lmsAssignmentId: a.id, lmsCourseId: courseId, title: a.title, itemType,
        description: module?.introHtml ?? undefined,
        dueAt: a.due_at, estimatedMinutes, progressPct: a.progress_pct, bufferState: a.buffer_state,
        steps: steps.map((s) => ({ id: s.id, orderIndex: s.order_index, title: s.title,
          timeboxMinutes: s.timebox_minutes, doneCriteria: s.done_criteria, status: s.status })),
      };
    });
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