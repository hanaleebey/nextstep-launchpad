// Assignment-specific steps built from the assignment's OWN text, used when
// the AI planner can't be reached. No generic templates: every step and
// criterion is taken from the title or the instructions in the description.
import type { DecomposedStep } from "./decompose";

const MAX_STEPS = 8;

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
    const out: DecomposedStep[] = [{ order_index: 0, title: `Watch "${name}"`, timebox_minutes: watch, done_criteria: ["Watched to the end"] }];
    const mins = extra.length ? split(Math.max(extra.length, total - watch), extra.length) : [];
    extra.forEach((s, i) => out.push({ order_index: i + 1, title: s, timebox_minutes: mins[i]!, done_criteria: [`Done: ${s}`] }));
    return out;
  }

  // Reading with a page range: chunk the pages.
  if (pages && (t === "reading" || t === "read")) {
    const [a, b] = pages;
    const chunks = Math.min(MAX_STEPS, Math.max(1, Math.ceil(total / 25)));
    const per = Math.ceil((b - a + 1) / chunks);
    const mins = split(total, chunks);
    const out: DecomposedStep[] = [];
    for (let i = 0; i < chunks; i++) {
      const s = a + i * per, e = Math.min(b, s + per - 1);
      if (s > b) break;
      out.push({ order_index: i, title: `Read pages ${s}–${e} of "${name}" and take notes`, timebox_minutes: mins[i]!, done_criteria: [`Pages ${s}–${e} read`, "Key points noted in your own words"] });
    }
    return out;
  }

  // Instructions present: one step per instruction (merged if too many).
  if (instructions.length) {
    const groups: string[][] = [];
    const size = Math.ceil(instructions.length / MAX_STEPS);
    for (let i = 0; i < instructions.length; i += size) groups.push(instructions.slice(i, i + size));
    const mins = split(total, groups.length);
    return groups.map((g, i) => ({
      order_index: i,
      title: g[0]!.length > 90 ? `${g[0]!.slice(0, 87)}…` : g[0]!,
      timebox_minutes: mins[i]!,
      done_criteria: g.map((s) => `Addressed: ${s}`),
    }));
  }

  // Nothing but a title: one honest step named after the work itself.
  const verb = t === "quiz" ? "Take" : t === "reading" || t === "read" ? "Read" : t === "discussion" || t === "post" ? "Write and post" : "Complete";
  return [{ order_index: 0, title: `${verb} "${name}"`, timebox_minutes: Math.min(total, 50), done_criteria: [`"${name}" ${verb === "Take" ? "submitted" : "finished"}`] }];
}
