// LMS abstraction. Every LMS (Moodle, Canvas, mock) implements LmsProvider,
// and the rest of the app only ever sees these neutral shapes.

export interface SiteInfo {
  siteName: string;
  siteUrl: string;
  userFullName: string;
  userId: string;
}

export interface Course {
  lmsCourseId: string;
  name: string;
  code: string;
}

export type LmsStepStatus = "todo" | "done" | "blocked" | "stopped";

/** A suggested step that comes with an assignment (used as decomposition seed). */
export interface LmsStep {
  /** Database step id when the step is persisted (Moodle); absent for demo data. */
  id?: string;
  orderIndex: number;
  title: string;
  timeboxMinutes: number;
  doneCriteria: string[];
  status: LmsStepStatus;
}

export type LmsItemType = "video" | "read" | "quiz" | "paper" | "post";

export interface Assignment {
  lmsAssignmentId: string;
  lmsCourseId: string;
  title: string;
  itemType: LmsItemType;
  dueAt: string | null; // ISO timestamp
  estimatedMinutes: number | null;
  /** Moodle description/prompt (HTML), when known. */
  description?: string | undefined;
  progressPct: number;
  bufferState?: "green" | "amber" | "red";
  steps?: LmsStep[];
}

export interface CourseModule {
  id: string;
  name: string;
  modname: string; // e.g. "assign", "quiz", "page", "url"
  url?: string;
}

export interface LmsProvider {
  validateConnection(siteUrl: string, token: string): Promise<SiteInfo>;
  getCourses(): Promise<Course[]>;
  getAssignments(courseId: string): Promise<Assignment[]>;
  getCourseContents(courseId: string): Promise<CourseModule[]>;
}
