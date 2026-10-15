import { getLmsConnection, listAssignments, listCourses, listDetectedItems, listSteps } from "@/lib/db";
import type { LmsProvider, Assignment, CourseModule } from "./types";
import { MockProvider } from "./mockProvider";

/** Choose persisted Moodle work for connected users; keep mock mode for disconnected demos. */
export class CachedProvider implements LmsProvider {
  private mock = new MockProvider();
  validateConnection(siteUrl: string, token: string) { return this.mock.validateConnection(siteUrl, token); }
  async getCourses() {
    if (!(await getLmsConnection())?.site_url) return this.mock.getCourses();
    return (await listCourses()).map((c) => ({ lmsCourseId: c.id, name: c.name, code: c.code ?? c.name }));
  }
  async getAssignments(courseId: string): Promise<Assignment[]> {
    if (!(await getLmsConnection())?.site_url) return this.mock.getAssignments(courseId);
    const detected = await listDetectedItems();
    const rows = (await listAssignments()).filter((a) => a.course_id === courseId);
    return Promise.all(rows.map(async (a) => ({
      lmsAssignmentId: a.id, lmsCourseId: courseId, title: a.title,
      itemType: detected.find((d) => d.assignment_id === a.id)?.item_type ?? "paper",
      dueAt: a.due_at, estimatedMinutes: a.estimated_minutes, progressPct: a.progress_pct,
      bufferState: a.buffer_state,
      steps: (await listSteps(a.id)).map((s) => ({ orderIndex: s.order_index, title: s.title, timeboxMinutes: s.timebox_minutes, doneCriteria: s.done_criteria, status: s.status })),
    })));
  }
  async getCourseContents(courseId: string): Promise<CourseModule[]> {
    if (!(await getLmsConnection())?.site_url) return this.mock.getCourseContents(courseId);
    return (await this.getAssignments(courseId)).map((a) => ({ id: a.lmsAssignmentId, name: a.title, modname: a.itemType }));
  }
}
