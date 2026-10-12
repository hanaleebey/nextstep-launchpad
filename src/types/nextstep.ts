// NextStep domain types. Mirror the Supabase tables 1:1 (snake_case kept on purpose
// so rows from the database can be used directly without mapping).

export type LmsProviderKind = "moodle" | "canvas" | "mock";
export type AssignmentStatus = "todo" | "in_progress" | "done";
export type BufferState = "green" | "amber" | "red";
export type StepStatus = "todo" | "done" | "blocked" | "stopped";
export type ActivityKind = "sync" | "estimate" | "replan" | "calibrate";
export type DetectedItemType = "video" | "read" | "quiz" | "paper" | "post";
export type Confidence = "high" | "medium" | "low";
export type EstimateSource = "signal" | "allocated" | "manual";

export interface UserSettings {
  user_id: string;
  weekly_available_hours: number;
  study_window_start: string; // "HH:MM:SS"
  study_window_end: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface LmsConnection {
  id: string;
  user_id: string;
  provider: LmsProviderKind;
  site_url: string | null;
  token_encrypted: string | null; // never display or log
  connected_at: string;
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: string;
  user_id: string;
  lms_course_id: string | null;
  name: string;
  code: string | null;
  created_at: string;
  updated_at: string;
}

export interface Assignment {
  id: string;
  user_id: string;
  course_id: string | null;
  lms_assignment_id: string | null;
  title: string;
  due_at: string | null;
  status: AssignmentStatus;
  estimated_minutes: number | null;
  estimate_source: EstimateSource | null;
  estimated_is_manual: boolean;
  actual_minutes: number;
  progress_pct: number;
  buffer_state: BufferState;
  created_at: string;
  updated_at: string;
}

export interface Step {
  id: string;
  assignment_id: string;
  order_index: number;
  title: string;
  timebox_minutes: number;
  done_criteria: string[];
  status: StepStatus;
  created_at: string;
  updated_at: string;
}

export interface EstimateEvent {
  id: string;
  assignment_id: string;
  item_type: string;
  estimated_minutes: number;
  actual_minutes: number | null;
  confidence: Confidence;
  created_at: string;
}

export interface ActivityLogEntry {
  id: string;
  user_id: string;
  kind: ActivityKind;
  message: string;
  created_at: string;
}

export interface DetectedItem {
  id: string;
  user_id: string;
  item_type: DetectedItemType;
  title: string;
  source_course: string | null;
  signal_value: string | null;
  estimated_minutes: number | null;
  confidence: Confidence;
  confirmed: boolean;
  created_at: string;
  updated_at: string;
}

export interface WeeklyAllocation {
  id: string;
  user_id: string;
  assignment_id: string;
  week_start: string; // ISO date "YYYY-MM-DD"
  allocated_minutes: number;
  created_at: string;
  updated_at: string;
}

/** Fields the database fills in automatically; omit them on insert. */
type Auto = "id" | "user_id" | "created_at" | "updated_at";
export type NewCourse = Omit<Course, Auto>;
export type NewAssignment = Omit<Assignment, Auto | "status" | "actual_minutes" | "progress_pct" | "buffer_state" | "estimated_is_manual"> &
  Partial<Pick<Assignment, "status" | "actual_minutes" | "progress_pct" | "buffer_state" | "estimated_is_manual">>;
export type NewStep = Omit<Step, "id" | "created_at" | "updated_at" | "status"> & { status?: StepStatus };
export type NewEstimateEvent = Omit<EstimateEvent, "id" | "created_at">;
export type NewDetectedItem = Omit<DetectedItem, Auto | "confirmed"> & { confirmed?: boolean };
export type NewLmsConnection = Omit<LmsConnection, Auto | "connected_at">;
export type NewWeeklyAllocation = Omit<WeeklyAllocation, Auto>;
