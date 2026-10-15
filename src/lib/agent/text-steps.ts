// Assignment-specific steps built from the assignment's OWN text, used when
// the AI planner can't be reached. No generic templates: every step and
// criterion names the assignment itself, and non-video work is always broken
// into multiple steps sized to the estimate.
import type { DecomposedStep } from "./decompose";

const MAX_STEPS = 8;
const MAX_TIMEBOX = 50;

/** Split a description into individual instructions (numbered items, bullets, sentences). */
export function extractInstructions(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const parts = clean
    .split(/(?:^|\s)(?:\d+[.)]|[-•*])\s+|(?<=[.!?;])\s+/)
    .map((s) => s.trim().replace(/[.;]+$/, ""))
    .filter((s) => s.length >= 8 && s.split(" ").length >= 2);
  return Array.from(new Set(parts));
}

/** Page ranges like "pages 1-12" or "pp. 40–55". */
function pageRange(text: string): [number, number] | null {
  const m = text.match(/(?:pages?|pp?\.?)\s*(\d+)\s*[-–to]+\s*(\d+)/i);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]);
  return b > a ? [a, b] : null;
}

/** Spread total minutes across n steps, each ≥ 1, summing exactly to total. */
function split(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => Math.max(1, base + (i < total - base * n ? 1 : 0)));
}

/** Cap each step at MAX_TIMEBOX by adding more steps of the same shape when needed. */
function cap(total: number, wanted: number): number[] {
  const n = Math.max(wanted, Math.ceil(total / MAX_TIMEBOX));
  return split(total, Math.min(MAX_STEPS, n));
}

function step(order: number, title: string, minutes: number, criteria: string[]): DecomposedStep {
  return { order_index: order, title, timebox_minutes: Math.max(1, Math.round(minutes)), done_criteria: criteria };
}

export function stepsFromText(title: string, type: string, minutes: number | null | undefined, description: string): DecomposedStep[] {
  const name = title.trim();
  const total = Math.max(1, Math.round(minutes ?? 30));
  const t = type.toLowerCase();
  const instructions = extractInstructions(description);
  const pages = pageRange(`${title} ${description}`);

  // Video: just watch it, plus any extra instructions it gives.
  if (t === "video" || t === "lecture") {
    const extra = instructions.filter((s) => !/^watch\b/i.test(s)).slice(0, MAX_STEPS - 1);
    const watch = Math.max(1, extra.length ? Math.round(total * 0.7) : total);
    const out: DecomposedStep[] = [step(0, `Watch "${name}"`, watch, ["Watched to the end"])];
    const mins = extra.length ? split(Math.max(extra.length, total - watch), extra.length) : [];
    extra.forEach((s, i) => out.push(step(i + 1, s, mins[i]!, [`Done: ${s}`])));
    return out;
  }

  // Reading with a page range: chunk the pages.
  if (pages && (t === "reading" || t === "read")) {
    const [a, b] = pages;
    const chunks = Math.min(MAX_STEPS, Math.max(2, Math.ceil(total / 25)));
    const per = Math.ceil((b - a + 1) / chunks);
    const mins = split(total, chunks);
    const out: DecomposedStep[] = [];
    for (let i = 0; i < chunks; i++) {
      const s = a + i * per, e = Math.min(b, s + per - 1);
      if (s > b) break;
      out.push(step(i, `Read pages ${s}–${e} of "${name}" and take notes`, mins[i]!, [`Pages ${s}–${e} read`, "Key points noted in your own words"]));
    }
    return out;
  }

  // Instructions present: one step per instruction (merged if too many).
  if (instructions.length >= 2) {
    const groups: string[][] = [];
    const size = Math.ceil(instructions.length / MAX_STEPS);
    for (let i = 0; i < instructions.length; i += size) groups.push(instructions.slice(i, i + size));
    const mins = cap(total, groups.length);
    return groups.map((g, i) => step(
      i,
      g[0]!.length > 90 ? `${g[0]!.slice(0, 87)}…` : g[0]!,
      mins[i]!,
      g.map((s) => `Addressed: ${s}`),
    ));
  }

  // Little or no description: break the work into phases named after the
  // assignment, sized to the estimate. Never a single generic step.
  if (t === "quiz") {
    const mins = cap(total, 2);
    return [
      step(0, `Review the material covered by "${name}"`, mins[0]!, ["Reviewed the topics this quiz covers"]),
      step(1, `Take the quiz "${name}"`, mins[1]!, [`"${name}" submitted`]),
    ];
  }

  if (t === "reading" || t === "read") {
    const mins = cap(total, 3);
    const n = mins.length;
    const labels = ["the opening sections", "the middle sections", "the final sections"];
    return mins.map((m, i) => step(
      i,
      i === n - 1
        ? `Finish reading "${name}" and note the key points`
        : `Read ${labels[i] ?? `part ${i + 1}`} of "${name}"`,
      m,
      i === n - 1 ? [`All of "${name}" read`, "Key points noted in your own words"] : [`${labels[i] ?? `Part ${i + 1}`} of "${name}" read`],
    ));
  }

  if (t === "discussion" || t === "post" || t === "forum") {
    const mins = cap(total, 3);
    return [
      step(0, `Read the prompt and requirements for "${name}"`, Math.max(5, Math.round(mins[0]! * 0.5)), ["Know exactly what the post must include"]),
      step(1, `Draft your response to "${name}"`, mins[1]!, ["Draft covers every point the prompt asks for"]),
      step(2, `Post your response to "${name}" and reply to classmates if required`, mins[2] ?? mins[1]!, [`"${name}" posted`, "Any required replies done"]),
    ];
  }

  // Paper / project / default: outline → draft → revise → submit.
  const mins = cap(total, 4);
  const n = mins.length;
  const out: DecomposedStep[] = [
    step(0, `Plan and outline "${name}"`, mins[0]!, ["Outline covers everything the assignment asks for"]),
  ];
  if (n >= 3) {
    for (let i = 1; i < n - 1; i++) {
      out.push(step(i, n === 4 && i === 1 ? `Write the first draft of "${name}"` : `Keep writing "${name}" (part ${i})`, mins[i]!, [i === 1 ? "Full rough draft exists, gaps are fine" : "Draft extended toward complete"]));
    }
  }
  out.push(step(n - 1, `Revise, proofread and submit "${name}"`, mins[n - 1]!, ["Checked against every requirement", `"${name}" submitted`]));
  return out;
}
