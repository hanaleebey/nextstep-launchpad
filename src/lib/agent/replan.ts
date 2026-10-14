// Re-planner. Runs when a step is marked Blocked or an assignment goes RED.
//
//   1. Recompute buffers for every assignment (buffer.ts).
//   2. Simulate three candidate plans and pick ONE:
//        triage   – earliest deadline first, all remaining steps
//        compress – the at-risk item's steps cut to their essentials (~60%)
//        partial  – the at-risk item gets only what fits before its deadline;
//                   the rest is dropped (it will be submitted partial)
//      Ranking: most deadlines preserved → least work cut → least fatigue.
//      (Cutting work always looks less tiring, so we only accept a cut when it
//      saves a deadline the full plan would miss.)
//   3. Place the chosen plan's steps into free time (daily free minutes,
//      next 7 days) and save each step's scheduled_date.
//   4. Write one summary row to activity_log.
//
// Everything above "Persistence" is pure and unit-tested.
import {
  getSettings, listAssignments, listSteps, logActivity, updateStep,
} from "@/lib/db";
import { DEFAULT_WEEKLY_HOURS, dailyFreeMinutes, recomputeBufferStates } from "./buffer";

const DAY_MS = 86_400_000;
const HORIZON_DAYS = 7;
/** Compress keeps this share of the at-risk item's remaining minutes. */
export const COMPRESS_RATIO = 0.6;

export type ReplanOptionId = "triage" | "compress" | "partial";
export type ReplanTrigger = "blocked" | "red" | "accept";

export const OPTION_TITLE: Record<ReplanOptionId, string> = {
  triage: "Triage now",
  compress: "Compress into one block",
  partial: "Submit partial",
};

export interface PlanStep { id: string; title: string; minutes: number; blocked?: boolean }
export interface PlanItem { id: string; title: string; dueAt: string | null; steps: PlanStep[] }

export interface PlacedStep { stepId: string; itemId: string; minutes: number; dayIndex: number }

export interface SimulatedPlan {
  option: ReplanOptionId;
  placed: PlacedStep[];
  /** Items whose every remaining step lands on or before their due day. */
  preserved: string[];
  missed: string[];
  /** Sum over days of (load / capacity)²: heavy days cost more than spread-out ones. */
  fatigue: number;
  droppedMinutes: number;
}

/** Day index (0 = today) of a due date, relative to local midnight of `now`. */
function dueDayIndex(dueAt: string | null, now: Date): number {
  if (!dueAt) return Infinity;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.floor((new Date(dueAt).getTime() - start) / DAY_MS);
}

/** Earliest deadline first; within an item, blocked steps go to the back of its queue. */
export function orderSteps(items: PlanItem[], now: Date): { item: PlanItem; step: PlanStep }[] {
  return [...items]
    .sort((a, b) => dueDayIndex(a.dueAt, now) - dueDayIndex(b.dueAt, now))
    .flatMap((item) => {
      const ready = item.steps.filter((s) => !s.blocked);
      const blocked = item.steps.filter((s) => s.blocked);
      return [...ready, ...blocked].map((step) => ({ item, step }));
    });
}

/**
 * Fill each day's free minutes in order. A step goes on the first day that has
 * room. Steps that don't fit within the horizon are left unplaced.
 */
export function placeSteps(queue: { item: PlanItem; step: PlanStep }[], dailyMinutes: number): PlacedStep[] {
  const used = new Array(HORIZON_DAYS).fill(0);
  const placed: PlacedStep[] = [];
  for (const { item, step } of queue) {
    const day = used.findIndex((u) => u + step.minutes <= dailyMinutes);
    if (day === -1) continue;
    used[day] += step.minutes;
    placed.push({ stepId: step.id, itemId: item.id, minutes: step.minutes, dayIndex: day });
  }
  return placed;
}

/** Score a placement: which deadlines hold, and how tiring the week is. */
function score(items: PlanItem[], placed: PlacedStep[], dailyMinutes: number, now: Date) {
  const preserved: string[] = [];
  const missed: string[] = [];
  for (const item of items) {
    const due = dueDayIndex(item.dueAt, now);
    const mine = placed.filter((p) => p.itemId === item.id);
    const allPlaced = mine.length === item.steps.length;
    const onTime = mine.every((p) => p.dayIndex <= due);
    // Items due beyond the horizon only count if their placed steps are on time.
    const ok = due >= HORIZON_DAYS ? onTime : allPlaced && onTime;
    (ok ? preserved : missed).push(item.id);
  }
  const loads = new Array(HORIZON_DAYS).fill(0);
  placed.forEach((p) => (loads[p.dayIndex] += p.minutes));
  const fatigue = dailyMinutes > 0 ? loads.reduce((s, l) => s + (l / dailyMinutes) ** 2, 0) : 0;
  return { preserved, missed, fatigue: Math.round(fatigue * 100) / 100 };
}

/** Build one candidate plan for the at-risk item `riskId`. */
export function simulate(
  option: ReplanOptionId, items: PlanItem[], riskId: string | null, dailyMinutes: number, now: Date,
): SimulatedPlan {
  let working = items;
  let droppedMinutes = 0;

  if (option === "compress" && riskId) {
    // Same steps, shorter timeboxes (min 10 min): do only the essentials.
    working = items.map((it) => it.id !== riskId ? it : {
      ...it,
      steps: it.steps.map((s) => {
        const m = Math.max(10, Math.round(s.minutes * COMPRESS_RATIO));
        droppedMinutes += s.minutes - m;
        return { ...s, minutes: m };
      }),
    });
  }

  let placed = placeSteps(orderSteps(working, now), dailyMinutes);

  if (option === "partial" && riskId) {
    // Keep only the at-risk steps that land before its deadline; drop the rest.
    const risk = working.find((i) => i.id === riskId)!;
    const due = dueDayIndex(risk.dueAt, now);
    const keepIds = new Set(placed.filter((p) => p.itemId === riskId && p.dayIndex <= due).map((p) => p.stepId));
    const kept = risk.steps.filter((s) => keepIds.has(s.id));
    droppedMinutes = risk.steps.reduce((s, x) => s + x.minutes, 0) - kept.reduce((s, x) => s + x.minutes, 0);
    working = working.map((i) => (i.id === riskId ? { ...i, steps: kept } : i));
    placed = placeSteps(orderSteps(working, now), dailyMinutes);
  }

  const s = score(working, placed, dailyMinutes, now);
  // A partially-submitted item still counts as a missed deadline if work was dropped:
  // the student does not get full credit, so it must not look "free".
  if (option === "partial" && riskId && droppedMinutes > 0 && s.preserved.includes(riskId)) {
    s.preserved = s.preserved.filter((id) => id !== riskId);
    s.missed = [...s.missed, riskId];
  }
  return { option, placed, droppedMinutes, ...s };
}

/** Lower is better: missed deadlines, then work cut, then fatigue. */
function rank(p: SimulatedPlan): [number, number, number] {
  return [p.missed.length, p.droppedMinutes, p.fatigue];
}

/** Simulate all options and return the single recommendation plus the alternatives. */
export function recommendPlan(items: PlanItem[], riskId: string | null, weeklyHours: number, now = new Date()) {
  const daily = dailyFreeMinutes(weeklyHours);
  const options: ReplanOptionId[] = riskId ? ["triage", "compress", "partial"] : ["triage"];
  const plans = options.map((o) => simulate(o, items, riskId, daily, now));
  const best = [...plans].sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
  })[0]!;
  return { recommended: best, alternatives: plans.filter((p) => p !== best) };
}

/** One plain-language line for the activity feed. */
export function summarize(plan: SimulatedPlan, items: PlanItem[], trigger: ReplanTrigger): string {
  const why = trigger === "blocked" ? "A step was blocked" : trigger === "red" ? "An assignment ran out of buffer" : "You accepted a re-plan";
  const days = new Set(plan.placed.map((p) => p.dayIndex)).size;
  const missed = plan.missed.map((id) => items.find((i) => i.id === id)?.title).filter(Boolean);
  return `${why}. Applied "${OPTION_TITLE[plan.option]}": placed ${plan.placed.length} step(s) across ${days} day(s); ` +
    `${plan.preserved.length} of ${items.length} deadline(s) kept` +
    (missed.length ? ` (at risk: ${missed.join(", ")})` : "") +
    (plan.droppedMinutes ? `; trimmed ${plan.droppedMinutes} min of work.` : ".");
}

// ---------------------------------------------------------------- Persistence

function isoDay(now: Date, offset: number): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Full re-plan against the database.
 * @param option force a specific option (the Running-behind "Adjust" path); omit to use the recommendation.
 */
export async function runReplan(trigger: ReplanTrigger, option?: ReplanOptionId, now = new Date()) {
  // 1. Fresh buffers.
  const buffers = await recomputeBufferStates(now);

  const settings = await getSettings();
  const weeklyHours = Number(settings?.weekly_available_hours ?? DEFAULT_WEEKLY_HOURS);
  const assignments = (await listAssignments()).filter((a) => a.status !== "done");

  const items: PlanItem[] = [];
  for (const a of assignments) {
    const steps = (await listSteps(a.id)).filter((s) => s.status === "todo" || s.status === "blocked");
    items.push({
      id: a.id, title: a.title, dueAt: a.due_at,
      steps: steps.map((s) => ({ id: s.id, title: s.title, minutes: s.timebox_minutes, blocked: s.status === "blocked" })),
    });
  }

  // At-risk item = lowest slack among RED ones.
  const risk = Object.entries(buffers).filter(([, b]) => b.state === "red").sort((a, b) => a[1].slack - b[1].slack)[0];
  const riskId = risk?.[0] ?? null;

  // 2. One plan.
  const { recommended } = recommendPlan(items, riskId, weeklyHours, now);
  const plan = option ? simulate(option, items, riskId, dailyFreeMinutes(weeklyHours), now) : recommended;

  // 3. Move steps into free blocks. Blocked steps go back to "todo" at the end of their assignment.
  const placedById = new Map(plan.placed.map((p) => [p.stepId, p]));
  for (const item of items) {
    let nextIndex = 1000; // pushes un-blocked steps after the remaining ones
    for (const s of item.steps) {
      const p = placedById.get(s.id);
      await updateStep(s.id, {
        scheduled_date: p ? isoDay(now, p.dayIndex) : null,
        ...(s.blocked ? { status: "todo" as const, order_index: nextIndex++ } : {}),
      });
    }
  }

  // 4. Summary.
  await logActivity("replan", summarize(plan, items, trigger));
  return { plan, riskId };
}
