// MockProvider: realistic seed data that always works (no network).
// Due dates are relative to "now" so buffer states stay meaningful.
import type { Assignment, Course, CourseModule, LmsItemType, LmsProvider, LmsStep, SiteInfo } from "./types";

const COURSES: Course[] = [
  { lmsCourseId: "cs340", code: "CS 340", name: "Data Structures & Algorithms" },
  { lmsCourseId: "mkt210", code: "MKT 210", name: "Principles of Marketing" },
  { lmsCourseId: "psy101", code: "PSY 101", name: "Introduction to Psychology" },
  { lmsCourseId: "eng210", code: "ENG 210", name: "Academic Writing" },
];

/** Due date N days (fractional OK) from now. */
function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

/** Seven generic, timeboxed steps; titles adapt to the assignment. */
function makeSteps(title: string, totalMinutes: number, doneCount = 0): LmsStep[] {
  const titles = [
    `Open "${title}" and read the instructions`,
    "List what the finished work must include",
    "Gather sources / materials",
    "Draft the first half",
    "Draft the second half",
    "Review against the rubric",
    "Submit and confirm upload",
  ];
  const box = Math.max(10, Math.round(totalMinutes / 7 / 5) * 5);
  return titles.map((t, i) => ({
    orderIndex: i,
    title: t,
    timeboxMinutes: box,
    doneCriteria: ["Good enough beats perfect", `Step ${i + 1} of 7 visibly finished`],
    status: i < doneCount ? "done" : "todo",
  }));
}

function a(
  id: string, course: string, title: string, itemType: LmsItemType,
  dueInDays: number, minutes: number, doneSteps = 0,
): Assignment {
  return {
    lmsAssignmentId: id,
    lmsCourseId: course,
    title,
    itemType,
    dueAt: inDays(dueInDays),
    estimatedMinutes: minutes,
    progressPct: Math.round((doneSteps / 7) * 100),
    steps: makeSteps(title, minutes, doneSteps),
  };
}

// 11 assignments. "cs340-p2" is due in under a day with lots of work left,
// so its slack is <= 0 and it exercises the RED ("No room to be behind") state.
function seedAssignments(): Assignment[] {
  return [
    a("cs340-p2", "cs340", "Project 2: Hash Map Implementation", "paper", 0.5, 360, 1),
    a("cs340-q4", "cs340", "Quiz 4: Graph Traversal", "quiz", 3, 30),
    a("cs340-hw5", "cs340", "Homework 5: Dynamic Programming", "paper", 9, 240, 2),
    a("mkt210-v3", "mkt210", "Watch: Brand Positioning Lecture", "video", 2, 45),
    a("mkt210-cs", "mkt210", "Case Study: Patagonia", "paper", 6, 180, 3),
    a("mkt210-d2", "mkt210", "Discussion Post: Pricing Strategy", "post", 4, 40),
    a("psy101-r6", "psy101", "Read: Chapter 6 — Memory", "read", 1.2, 90),
    a("psy101-q3", "psy101", "Quiz 3: Learning & Conditioning", "quiz", 5, 25),
    a("psy101-rp", "psy101", "Research Paper Proposal", "paper", 14, 300, 1),
    a("eng210-e2", "eng210", "Essay 2: Argumentative Draft", "paper", 8, 270, 2),
    a("eng210-pr", "eng210", "Peer Review Post", "post", 11, 35),
  ];
}

export class MockProvider implements LmsProvider {
  async validateConnection(siteUrl: string, _token: string): Promise<SiteInfo> {
    return { siteName: "Demo University (mock)", siteUrl: siteUrl || "https://demo.local", userFullName: "Demo Student", userId: "mock-user" };
  }

  async getCourses(): Promise<Course[]> {
    return COURSES.map((c) => ({ ...c }));
  }

  async getAssignments(courseId: string): Promise<Assignment[]> {
    return seedAssignments().filter((x) => x.lmsCourseId === courseId);
  }

  async getCourseContents(courseId: string): Promise<CourseModule[]> {
    return seedAssignments()
      .filter((x) => x.lmsCourseId === courseId)
      .map((x) => ({
        id: x.lmsAssignmentId,
        name: x.title,
        modname: x.itemType === "quiz" ? "quiz" : x.itemType === "video" ? "url" : x.itemType === "read" ? "page" : "assign",
      }));
  }
}
