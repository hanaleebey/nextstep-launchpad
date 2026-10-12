// DEV ONLY. Loaded via dynamic import from a button that only renders when
// import.meta.env.DEV is true, so it never ships in the hosted build.
// Inserts a demo week for the signed-in user; skips titles that already exist.
import { createAssignment, listAssignments, upsertCourse } from "@/lib/db";
import { estimateQuiz, estimateReading, estimateVideo } from "@/lib/agent/estimate";
import { persistEstimate } from "@/lib/agent/persist-estimate";

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

export async function loadDemoWeek(): Promise<number> {
  const existing = new Set((await listAssignments()).map((a) => a.title));
  const ml = await upsertCourse({ lms_course_id: "demo-cs450", name: "Machine Learning", code: "CS 450" });
  const math = await upsertCourse({ lms_course_id: "demo-math221", name: "Linear Algebra", code: "MATH 221" });
  const psy = await upsertCourse({ lms_course_id: "demo-psy210", name: "Cognitive Psychology", code: "PSY 210" });
  const eng = await upsertCourse({ lms_course_id: "demo-eng210", name: "Academic Writing", code: "ENG 210" });

  const items = [
    { title: "Watch: Intro to Neural Networks", course: ml.id, days: 2, type: "video", est: estimateVideo({ durationSeconds: 22 * 60 }) },
    { title: "Quiz 3: Linear Algebra", course: math.id, days: 3, type: "quiz", est: estimateQuiz({ timeLimitSeconds: 25 * 60 }) },
    { title: "Read: Chapter 7 (18 pages)", course: psy.id, days: 4, type: "read", est: estimateReading({ wordCount: 3600, pageCount: 18 }) },
    { title: "Essay: Research Proposal", course: eng.id, days: 6, type: "paper", est: null }, // open-ended, no signal
  ];

  let added = 0;
  for (const it of items) {
    if (existing.has(it.title)) continue;
    const a = await createAssignment({
      course_id: it.course, lms_assignment_id: null, title: it.title, due_at: inDays(it.days),
      status: "todo", estimated_minutes: null, estimate_source: null,
    });
    if (it.est) await persistEstimate(a.id, it.type, it.est);
    added++;
  }
  return added;
}
