// Thin, typed repository over Supabase. Every view reads/writes through here.
// Row-level security guarantees each user only ever touches their own rows,
// so these functions don't filter by user_id themselves (the DB does it).
import { supabase } from "@/integrations/supabase/client";
import type {
  ActivityKind, ActivityLogEntry, Assignment, Course, DetectedItem, EstimateEvent,
  LmsConnection, NewAssignment, NewCourse, NewDetectedItem, NewEstimateEvent,
  NewLmsConnection, NewStep, NewWeeklyAllocation, Step, StepStatus, UserSettings, WeeklyAllocation,
} from "@/types/nextstep";

// The generated Supabase types may lag behind migrations, so we use an untyped
// handle here and cast results to our own domain types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Throw on error, otherwise return data. Keeps every call site one line. */
function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return data.user.id;
}

// ---------- users_settings ----------
export async function getSettings(): Promise<UserSettings | null> {
  return unwrap(await db.from("users_settings").select("*").maybeSingle());
}
export async function saveSettings(
  patch: Partial<Omit<UserSettings, "user_id" | "created_at" | "updated_at">>,
): Promise<UserSettings> {
  const user_id = await currentUserId();
  return unwrap(await db.from("users_settings").upsert({ user_id, ...patch }).select().single());
}
/** Create the default settings row on first sign-in (column defaults fill values). */
export async function ensureDefaultSettings(): Promise<void> {
  if (await getSettings()) return;
  const user_id = await currentUserId();
  unwrap(await db.from("users_settings").upsert({ user_id }, { onConflict: "user_id", ignoreDuplicates: true }));
}

// ---------- lms_connections ----------
export async function getLmsConnection(): Promise<LmsConnection | null> {
  return unwrap(
    await db.from("lms_connections").select("*").order("connected_at", { ascending: false }).limit(1).maybeSingle(),
  );
}
export async function addLmsConnection(input: NewLmsConnection): Promise<LmsConnection> {
  return unwrap(await db.from("lms_connections").insert(input).select().single());
}
export async function removeLmsConnection(id: string): Promise<void> {
  unwrap(await db.from("lms_connections").delete().eq("id", id));
}

// ---------- courses ----------
export async function listCourses(): Promise<Course[]> {
  return unwrap(await db.from("courses").select("*").order("name"));
}
export async function upsertCourse(input: NewCourse): Promise<Course> {
  const user_id = await currentUserId();
  return unwrap(
    await db.from("courses").upsert({ user_id, ...input }, { onConflict: "user_id,lms_course_id" }).select().single(),
  );
}

// ---------- assignments ----------
export async function listAssignments(): Promise<Assignment[]> {
  return unwrap(await db.from("assignments").select("*").order("due_at", { ascending: true, nullsFirst: false }));
}
export async function getAssignment(id: string): Promise<Assignment | null> {
  return unwrap(await db.from("assignments").select("*").eq("id", id).maybeSingle());
}
export async function createAssignment(input: NewAssignment): Promise<Assignment> {
  return unwrap(await db.from("assignments").insert(input).select().single());
}
export async function updateAssignment(
  id: string,
  patch: Partial<Omit<Assignment, "id" | "user_id" | "created_at" | "updated_at">>,
): Promise<Assignment> {
  return unwrap(await db.from("assignments").update(patch).eq("id", id).select().single());
}

// ---------- steps ----------
export async function listSteps(assignmentId: string): Promise<Step[]> {
  return unwrap(await db.from("steps").select("*").eq("assignment_id", assignmentId).order("order_index"));
}
export async function createSteps(steps: NewStep[]): Promise<Step[]> {
  return unwrap(await db.from("steps").insert(steps).select());
}
export async function setStepStatus(id: string, status: StepStatus): Promise<Step> {
  return unwrap(await db.from("steps").update({ status }).eq("id", id).select().single());
}

// ---------- estimate_events ----------
export async function listEstimateEvents(itemType?: string): Promise<EstimateEvent[]> {
  let q = db.from("estimate_events").select("*").order("created_at", { ascending: false });
  if (itemType) q = q.eq("item_type", itemType);
  return unwrap(await q);
}
export async function addEstimateEvent(input: NewEstimateEvent): Promise<EstimateEvent> {
  return unwrap(await db.from("estimate_events").insert(input).select().single());
}

// ---------- activity_log ----------
export async function listActivity(limit = 20): Promise<ActivityLogEntry[]> {
  return unwrap(await db.from("activity_log").select("*").order("created_at", { ascending: false }).limit(limit));
}
export async function logActivity(kind: ActivityKind, message: string): Promise<ActivityLogEntry> {
  return unwrap(await db.from("activity_log").insert({ kind, message }).select().single());
}

// ---------- detected_items ----------
export async function listDetectedItems(): Promise<DetectedItem[]> {
  return unwrap(await db.from("detected_items").select("*").order("created_at"));
}
export async function addDetectedItems(items: NewDetectedItem[]): Promise<DetectedItem[]> {
  return unwrap(await db.from("detected_items").insert(items).select());
}
export async function setDetectedItemConfirmed(id: string, confirmed: boolean): Promise<DetectedItem> {
  return unwrap(await db.from("detected_items").update({ confirmed }).eq("id", id).select().single());
}
