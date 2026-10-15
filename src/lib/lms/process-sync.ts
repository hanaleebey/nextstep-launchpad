import {
  listDetectedItems, listAssignments, listCourses, logActivity, replaceDetectedItems,
  updateAssignment,
} from "@/lib/db";
import { inferDueDates } from "@/lib/agent/infer-due";
import { estimate, type EstimateInput } from "@/lib/agent/estimate";
import { estimateRefineAndPersist } from "@/lib/agent/persist-estimate";
import { weekInTimezone } from "@/lib/time/week-in-timezone";
import type { DetectedItem, NewDetectedItem } from "@/types/nextstep";
import type { MoodleSyncItem, MoodleSyncResult } from "./moodle-sync";

function inputFor(item: MoodleSyncItem): EstimateInput {
  if (item.itemType === "video") return { kind: "video", signals: { durationSeconds: item.videoDurationSeconds } };
  if (item.itemType === "read") return { kind: "read", signals: { wordCount: item.wordCount ?? null } };
  if (item.itemType === "quiz") return { kind: "quiz", signals: { timeLimitSeconds: item.quizTimeLimitSeconds, questionCount: item.questionCount ?? null } };
  if (item.itemType === "paper") return { kind: "writing", signals: { targetWords: item.targetWords ?? null, hasRubric: Boolean(item.rubric?.length) } };
  return { kind: "other" };
}

function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, "0")} length`;
}

function signalLabel(item: MoodleSyncItem, signals: string[]): string {
  if (item.videoDurationSeconds) return clock(item.videoDurationSeconds);
  if (item.wordCount) return `${item.wordCount.toLocaleString()} words`;
  if (item.quizTimeLimitSeconds) return `${Math.ceil(item.quizTimeLimitSeconds / 60)}-minute quiz limit`;
  if (item.questionCount) return `${item.questionCount} questions`;
  if (item.targetWords) return `${item.targetWords.toLocaleString()}-word rubric`;
  const fallback = signals.find((s) => s.startsWith("fallback:"));
  return fallback ? "No timing signal found" : signals[0] ?? "Course activity";
}

/** Estimate the ordered sync output, infer safe dates, and cache this week's detection list. */
export async function processMoodleSync(sync: MoodleSyncResult, timezone: string): Promise<DetectedItem[]> {
  const assignments = await listAssignments();
  const courses = await listCourses();
  const assignmentByCmid = new Map(assignments.map((a) => [a.lms_assignment_id, a]));
  const courseName = new Map(courses.map((c) => [c.lms_course_id, c.name]));
  const preliminary = sync.items.map((item) => ({ item, base: estimate(inputFor(item)) }));
  const courseIds = [...new Set(sync.items.map((item) => item.lmsCourseId))];
  const dueDates = courseIds.flatMap((id) => inferDueDates(preliminary.filter(({ item }) => item.lmsCourseId === id).map(({ item, base }) => ({
    id: item.cmid, section: item.sectionIndex, position: item.moduleIndex,
    dueAt: item.dueAt, estimatedMinutes: assignmentByCmid.get(item.cmid)?.estimated_is_manual ? assignmentByCmid.get(item.cmid)?.estimated_minutes ?? base.minutes : base.minutes,
  }))));
  const dueById = new Map(dueDates.map((d) => [d.id, d.dueAt]));
  const { start, end } = weekInTimezone(new Date(), timezone);
  const rows: NewDetectedItem[] = [];

  for (const { item, base } of preliminary) {
    const assignment = assignmentByCmid.get(item.cmid);
    if (!assignment || assignment.status === "done") continue;
    const dueAt = dueById.get(item.cmid) ?? item.dueAt;
    if (dueAt && assignment.due_at !== dueAt) await updateAssignment(assignment.id, { due_at: dueAt });
    if (!dueAt || new Date(dueAt) < start || new Date(dueAt) >= end) continue;
    const refined = await estimateRefineAndPersist(assignment.id, item.itemType, base, {
      title: item.title, type: item.itemType, introHtml: item.introHtml ?? null, rubric: item.rubric ?? [],
    });
    rows.push({
      assignment_id: assignment.id,
      estimated_is_manual: assignment.estimated_is_manual,
      item_type: item.itemType,
      title: item.title,
      source_course: courseName.get(item.lmsCourseId) ?? null,
      signal_value: signalLabel(item, refined.signals),
      estimated_minutes: assignment.estimated_is_manual ? assignment.estimated_minutes : refined.minutes,
      confidence: refined.confidence,
    });
  }

  // Preserve cached items from unreachable courses on partial sync.
  const existing = sync.partial ? await listDetectedItems() : [];
  const touched = new Set(rows.map((row) => row.assignment_id));
  const retained = existing.filter((row) => !touched.has(row.assignment_id)).map(({ id, user_id, created_at, updated_at, ...row }) => row);
  const saved = await replaceDetectedItems([...rows, ...retained]);
  await logActivity("sync", `Synced ${sync.summary.courses} courses and detected ${saved.length} items for this week${sync.partial ? " (partial sync)" : ""}.`);
  return saved;
}