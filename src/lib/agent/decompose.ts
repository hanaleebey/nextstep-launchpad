// Decomposition: turn one assignment into 4–8 small, ordered, timeboxed steps.
//
// Pure and deterministic — no AI, no database. The same input always gives
// the same steps, which makes this easy to test and to explain.
//
// How it works, in three moves:
//   1. Pick a template for the assignment type (paper, quiz, reading,
//      discussion, project). Each template lists 8 candidate steps in order,
//      and each step has a "priority" (1 = most essential).
//   2. Decide HOW MANY steps (4–8) from the estimated total: roughly one step
//      per 50 minutes, so no step needs more than its 50-minute maximum.
//      Keep the N most essential steps, in their original order.
//   3. Split the estimated total across those steps by each step's weight,
//      round to 5 minutes, and clamp each one to 15–50 minutes.

export type DecomposeType = "paper" | "quiz" | "reading" | "discussion" | "project" | "video";

export interface DecomposeInput {
  title: string;
  /** Any type string; unknown types are mapped to the closest template. */
  type: string;
  estimatedMinutes: number | null;
  dueAt: string | null;
}

export interface DecomposedStep {
  order_index: number;
  title: string;
  timebox_minutes: number;
  done_criteria: string[];
}

export const MIN_STEPS = 4;
export const MAX_STEPS = 8;
export const MIN_TIMEBOX = 15;
export const MAX_TIMEBOX = 50;
/** Used when an assignment has no estimate yet (matches the estimator's fallback scale). */
export const DEFAULT_TOTAL_MINUTES = 120;

/** One candidate step in a template. */
interface TemplateStep {
  title: string;
  /** Relative share of the total time. */
  weight: number;
  /** 1 = always kept; 8 = first dropped when fewer steps are needed. */
  priority: number;
  done: string[];
}

// Every title is a concrete action you can start right away (no "plan" or
// "think about" steps that hide a decision). Done-criteria say what
// "good enough" looks like, so the student knows when to stop.
const TEMPLATES: Record<DecomposeType, TemplateStep[]> = {
  paper: [
    { title: "Read the prompt and highlight what it asks for", weight: 1, priority: 1, done: ["Prompt read once", "Required parts highlighted"] },
    { title: "Find three sources and save the links", weight: 1.5, priority: 5, done: ["Three sources saved", "One line on why each is useful"] },
    { title: "Write a one-sentence main point", weight: 0.6, priority: 3, done: ["One sentence written", "It answers the prompt"] },
    { title: "List your section headings in order", weight: 1, priority: 4, done: ["Three to five headings written"] },
    { title: "Write a rough first half — messy is fine", weight: 2, priority: 2, done: ["Every first-half heading has text", "No editing yet"] },
    { title: "Write a rough second half — messy is fine", weight: 2, priority: 6, done: ["Every remaining heading has text"] },
    { title: "Read it once and fix the biggest problems", weight: 1.2, priority: 7, done: ["Read start to finish", "Top three issues fixed"] },
    { title: "Check format and submit", weight: 0.6, priority: 1, done: ["Name, title and citations present", "File uploaded"] },
  ],
  quiz: [
    { title: "Open the quiz page and note the topics covered", weight: 0.6, priority: 1, done: ["Topic list written"] },
    { title: "Skim your notes on the first topic", weight: 1, priority: 3, done: ["Notes skimmed", "Two key points written down"] },
    { title: "Skim your notes on the remaining topics", weight: 1, priority: 5, done: ["Every topic skimmed once"] },
    { title: "Do five practice questions", weight: 1.2, priority: 2, done: ["Five questions answered", "Wrong ones marked"] },
    { title: "Re-check the questions you got wrong", weight: 1, priority: 6, done: ["Each wrong answer understood"] },
    { title: "Write a one-page cheat sheet from memory", weight: 1, priority: 7, done: ["One page written without looking"] },
    { title: "Set up a quiet spot with the quiz open", weight: 0.4, priority: 8, done: ["Phone away", "Quiz page loaded"] },
    { title: "Take the quiz", weight: 1.5, priority: 1, done: ["Every question answered", "Submitted"] },
  ],
  reading: [
    { title: "Open the reading and look at the headings", weight: 0.5, priority: 1, done: ["Headings skimmed", "Page count noted"] },
    { title: "Read the first quarter", weight: 1, priority: 2, done: ["First quarter read", "One note written"] },
    { title: "Read the second quarter", weight: 1, priority: 3, done: ["Second quarter read", "One note written"] },
    { title: "Read the third quarter", weight: 1, priority: 4, done: ["Third quarter read", "One note written"] },
    { title: "Read the last quarter", weight: 1, priority: 5, done: ["Reading finished", "One note written"] },
    { title: "Write three main ideas in your own words", weight: 0.6, priority: 1, done: ["Three ideas written"] },
    { title: "Write one question you still have", weight: 0.3, priority: 7, done: ["One question written"] },
    { title: "Mark the reading as done", weight: 0.2, priority: 8, done: ["Notes saved where you will find them"] },
  ],
  discussion: [
    { title: "Read the discussion prompt", weight: 0.5, priority: 1, done: ["Prompt read", "What to answer underlined"] },
    { title: "Open the reading it refers to and find one quote", weight: 1, priority: 3, done: ["One quote or example saved"] },
    { title: "Write your answer in three to five sentences", weight: 1.2, priority: 2, done: ["Three to five sentences written", "Quote included"] },
    { title: "Read it once and fix typos", weight: 0.4, priority: 5, done: ["Read once", "Typos fixed"] },
    { title: "Post your answer", weight: 0.3, priority: 1, done: ["Post is live"] },
    { title: "Read two classmates' posts", weight: 0.8, priority: 4, done: ["Two posts read"] },
    { title: "Reply to the first classmate", weight: 0.6, priority: 6, done: ["Reply of two or more sentences posted"] },
    { title: "Reply to the second classmate", weight: 0.6, priority: 7, done: ["Second reply posted"] },
  ],
  video: [
    { title: "Open the video and note its length", weight: 0.3, priority: 1, done: ["Video open", "Length noted"] },
    { title: "Watch the first half and pause to note key terms", weight: 1, priority: 2, done: ["First half watched", "Two key terms written"] },
    { title: "Watch the second half and note one example", weight: 1, priority: 3, done: ["Video finished", "One example written"] },
    { title: "Write three takeaways in your own words", weight: 0.6, priority: 1, done: ["Three takeaways written"] },
    { title: "Write one question the video left open", weight: 0.3, priority: 5, done: ["One question written"] },
    { title: "Rewatch the part you understood least", weight: 0.6, priority: 6, done: ["Tricky part rewatched", "Note updated"] },
  ],
  project: [
    { title: "Read the project brief and list what you must hand in", weight: 0.8, priority: 1, done: ["Deliverables listed"] },
    { title: "Set up your files and folder", weight: 0.5, priority: 4, done: ["Folder created", "Starter files open"] },
    { title: "Build the smallest piece that works", weight: 2, priority: 2, done: ["One part runs or exists end to end"] },
    { title: "Build the next required piece", weight: 2, priority: 3, done: ["Second deliverable started and working"] },
    { title: "Build the remaining required pieces", weight: 2, priority: 5, done: ["Every listed deliverable exists"] },
    { title: "Test it against the brief", weight: 1, priority: 6, done: ["Each requirement checked off"] },
    { title: "Fix the top problems you found", weight: 1, priority: 7, done: ["Top three problems fixed"] },
    { title: "Package and submit", weight: 0.6, priority: 1, done: ["Files named clearly", "Submitted"] },
  ],
};

/** Map loose type names (from the LMS or detection) to one of our five templates. */
export function normaliseType(type: string): DecomposeType {
  const t = type.toLowerCase();
  if (["paper", "essay", "writing", "report"].includes(t)) return "paper";
  if (["quiz", "exam", "test"].includes(t)) return "quiz";
  if (["video", "lecture"].includes(t)) return "video";
  if (["reading", "read", "chapter", "page", "url", "resource", "book"].includes(t)) return "reading";
  if (["discussion", "post", "forum"].includes(t)) return "discussion";
  return "project"; // open-ended default
}

/** How many steps: about one per 50 minutes, kept within 4–8. */
export function stepCountFor(totalMinutes: number): number {
  const n = Math.ceil(totalMinutes / MAX_TIMEBOX);
  return Math.min(MAX_STEPS, Math.max(MIN_STEPS, n));
}

/** Round to the nearest 5 minutes and clamp to the 15–50 range. */
function clampTimebox(minutes: number): number {
  const rounded = Math.round(minutes / 5) * 5;
  return Math.min(MAX_TIMEBOX, Math.max(MIN_TIMEBOX, rounded));
}

/**
 * Split `total` minutes by weight, respecting the 15–50 limits.
 * If a step would go over 50 (or under 15), it is pinned at the limit and the
 * leftover time is shared among the remaining steps — so heavy steps don't
 * silently swallow minutes. Repeats until nothing is out of range.
 */
export function splitByWeight(total: number, weights: number[]): number[] {
  const result: (number | null)[] = weights.map(() => null);
  let remaining = total;
  for (let pass = 0; pass < weights.length; pass++) {
    const open = weights.map((w, i) => (result[i] === null ? i : -1)).filter((i) => i >= 0);
    if (open.length === 0) break;
    const wSum = open.reduce((s, i) => s + (weights[i] ?? 0), 0);
    let pinned = false;
    for (const i of open) {
      const share = (remaining * (weights[i] ?? 0)) / wSum;
      if (share > MAX_TIMEBOX || share < MIN_TIMEBOX) {
        result[i] = share > MAX_TIMEBOX ? MAX_TIMEBOX : MIN_TIMEBOX;
        remaining -= result[i] as number;
        pinned = true;
      }
    }
    if (!pinned) {
      for (const i of open) result[i] = (remaining * (weights[i] ?? 0)) / wSum;
      break;
    }
  }
  return result.map((m) => clampTimebox(m ?? MIN_TIMEBOX));
}

/** Bounded work (has a hard length) can be shorter than the usual 4×15 min plan. */
const BOUNDED: DecomposeType[] = ["video", "quiz", "reading", "discussion"];
export const SHORT_TASK_LIMIT = 60;

/**
 * Make generic template text specific to THIS assignment by naming it.
 * e.g. "Open the video and note its length" -> "Open "Classical Conditioning" and note its length".
 */
export function personalise(text: string, title: string): string {
  const t = `"${title.trim()}"`;
  const rules: [RegExp, string][] = [
    [/\bthe discussion prompt\b/i, `the ${t} prompt`],
    [/\bthe project brief\b/i, `the ${t} brief`],
    [/\bthe quiz page\b/i, `the ${t} quiz page`],
    [/\bthe quiz\b/i, t],
    [/\bthe prompt\b/i, `the ${t} prompt`],
    [/\bthe reading\b/i, t],
    [/\bthe video\b/i, t],
    [/^Package and submit$/i, `Package and submit ${t}`],
    [/^Check format and submit$/i, `Check format and submit ${t}`],
    [/^Post your answer$/i, `Post your answer to ${t}`],
  ];
  for (const [re, rep] of rules) if (re.test(text)) return text.replace(re, rep);
  return text;
}

/** Short bounded task: 1–3 steps whose minutes add up EXACTLY to the hard estimate. */
function decomposeShort(input: DecomposeInput, type: DecomposeType, total: number): DecomposedStep[] {
  const count = total <= 10 ? 1 : total <= 30 ? 2 : 3;
  const title = input.title.trim();
  const first: Record<string, [string, string[]]> = {
    video: [`Watch "${title}" start to finish`, ["Video watched to the end", "Two key terms noted"]],
    quiz: [`Take "${title}"`, ["Every question answered", "Submitted"]],
    reading: [`Read "${title}"`, ["Reading finished", "One note written"]],
    discussion: [`Write and post your answer to "${title}"`, ["Answer posted"]],
  };
  const [mainTitle, mainDone] = first[type] ?? first["reading"]!;
  const plan: [string, string[], number][] = [[mainTitle, mainDone, 1]];
  if (count >= 2) plan.push([`Write three takeaways from "${title}" in your own words`, ["Three takeaways written"], 0.35]);
  if (count >= 3) plan.push(["Write one question you still have", ["One question written"], 0.15]);
  const wSum = plan.reduce((s, p) => s + p[2], 0);
  const mins = plan.map((p) => Math.max(1, Math.round((total * p[2]) / wSum)));
  mins[0] = Math.max(1, total - mins.slice(1).reduce((s, m) => s + m, 0)); // exact total
  return plan.map(([t, done], i) => ({ order_index: i, title: t, timebox_minutes: mins[i]!, done_criteria: [...done] }));
}

/**
 * Produce ordered, timeboxed steps for an assignment.
 * Note: very small totals (< 60 min) or very large ones (> 400 min) can't hit
 * the total exactly because of the 15–50 limits; we stay as close as allowed.
 */
export function decompose(input: DecomposeInput): DecomposedStep[] {
  const total = input.estimatedMinutes && input.estimatedMinutes > 0 ? input.estimatedMinutes : DEFAULT_TOTAL_MINUTES;
  const type = normaliseType(input.type);
  if (BOUNDED.includes(type) && total < SHORT_TASK_LIMIT) return decomposeShort(input, type, Math.round(total));
  const template = TEMPLATES[type];
  const count = stepCountFor(total);

  // Keep the `count` most essential steps, then restore template order.
  const kept = template
    .map((step, i) => ({ step, i }))
    .sort((a, b) => a.step.priority - b.step.priority || a.i - b.i)
    .slice(0, count)
    .sort((a, b) => a.i - b.i)
    .map(({ step }) => step);

  const minutes = splitByWeight(total, kept.map((k) => k.weight));
  return kept.map((step, idx) => ({
    order_index: idx,
    title: personalise(step.title, input.title),
    timebox_minutes: minutes[idx] ?? MIN_TIMEBOX,
    done_criteria: step.done.map((d) => personalise(d, input.title)),
  }));
}
