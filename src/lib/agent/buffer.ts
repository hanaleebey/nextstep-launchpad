// Buffer engine for the agent loop.
//
//   slack (days) = days until deadline − remaining minutes / daily free minutes
//   daily free minutes = weekly_available_hours × 60 / 7
//
// "Remaining minutes":
//   - fixed work (signal or manual estimate): estimate × (1 − progress)
//   - open-ended work: this week's slice from weekly_allocations (allocate.ts),
//     NOT a signal estimate.
//
// States: GREEN slack > 1 day · AMBER 0 < slack <= 1 · RED slack <= 0.
// Pure functions first; the one DB function (recomputeBufferStates) is at the bottom.
import {
  getSettings, listAssignments, listWeeklyAllocations, updateAssignment,
} from "@/lib/db";
import type { Assignment, BufferState } from "@/types/nextstep";

const DAY_MS = 86_400_000;
export const DEFAULT_WEEKLY_HOURS = 20;

export const BUFFER_LABEL: Record<BufferState, string> = {
  green: "On track",
  amber: "Tight",
  red: "No room to be behind",
};

/** Minutes of free time per day, from the weekly capacity setting. */
export function dailyFreeMinutes(weeklyHours: number): number {
  return (weeklyHours * 60) / 7;
}

/** Open-ended = not signal-estimated and not manually overridden (same rule as allocate-persist). */
export function isOpenEnded(a: Pick<Assignment, "estimate_source" | "estimated_is_manual">): boolean {
  return !a.estimated_is_manual && a.estimate_source !== "signal";
}

/**
 * Work left on an item, in minutes.
 * Open-ended items use this week's allocation (0 if none was allocated).
 */
export function remainingMinutesFor(
  a: Pick<Assignment, "estimate_source" | "estimated_is_manual" | "estimated_minutes" | "progress_pct">,
  weeklyAllocation: number | undefined,
): number {
  if (isOpenEnded(a)) return Math.max(0, weeklyAllocation ?? 0);
  const est = a.estimated_minutes ?? 30; // fallback estimate
  return Math.max(0, Math.round(est * (1 - (a.progress_pct ?? 0) / 100)));
}

/** Slack in days. No deadline → Infinity (never at risk). Zero capacity → -Infinity if work remains. */
export function computeSlack(dueAt: string | null, remaining: number, weeklyHours: number, now = new Date()): number {
  if (!dueAt) return Infinity;
  const daysLeft = (new Date(dueAt).getTime() - now.getTime()) / DAY_MS;
  const perDay = dailyFreeMinutes(weeklyHours);
  if (perDay <= 0) return remaining > 0 ? -Infinity : daysLeft;
  return daysLeft - remaining / perDay;
}

/** Map slack to a state. Exactly 0 is RED; exactly 1 is AMBER. */
export function bufferStateFor(slack: number): BufferState {
  if (slack > 1) return "green";
  if (slack > 0) return "amber";
  return "red";
}

/** Short readable duration: "45 min", "2h 10m", "1.5 days". */
function fmtMinutes(m: number): string {
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  return r ? `${h}h ${r}m` : `${h}h`;
}
function fmtDays(d: number): string {
  const v = Math.abs(d);
  if (v < 1) return `${Math.round(v * 24)} hours`;
  return `${Number(v.toFixed(1))} days`;
}

/** Plain-language reason for the Execute view's "Why this now" line. */
export function whyThisNow(input: { title: string; dueAt: string | null; remaining: number; slack: number; now?: Date }): string {
  const { title, dueAt, remaining, slack } = input;
  if (!dueAt) return `${title} has no deadline, so it's a good time to chip away at it.`;
  const state = bufferStateFor(slack);
  const left = fmtMinutes(remaining);
  if (state === "red") {
    return slack === 0
      ? `${title} has exactly zero spare time: ${left} of work fills every free minute before it's due. No room to be behind.`
      : `${title} is ${fmtDays(slack)} short: ${left} of work doesn't fit before it's due. No room to be behind.`;
  }
  if (state === "amber") return `${title} has under a day of spare time (${fmtDays(slack)}) with ${left} left — doing it now keeps it on track.`;
  return `${title} has ${fmtDays(slack)} of spare time; starting now keeps that buffer.`;
}

/**
 * Recompute buffer_state for every assignment and write it back.
 * Open-ended items use their most recent weekly allocation.
 */
export async function recomputeBufferStates(now = new Date()): Promise<Record<string, { slack: number; state: BufferState }>> {
  const settings = await getSettings();
  const weeklyHours = Number(settings?.weekly_available_hours ?? DEFAULT_WEEKLY_HOURS);

  // listWeeklyAllocations is ordered newest week first → first seen = latest slice.
  const latest = new Map<string, number>();
  for (const row of await listWeeklyAllocations()) {
    if (!latest.has(row.assignment_id)) latest.set(row.assignment_id, row.allocated_minutes);
  }

  const out: Record<string, { slack: number; state: BufferState }> = {};
  for (const a of await listAssignments()) {
    if (a.status === "done") continue;
    const remaining = remainingMinutesFor(a, latest.get(a.id));
    const slack = computeSlack(a.due_at, remaining, weeklyHours, now);
    const state = bufferStateFor(slack);
    out[a.id] = { slack, state };
    if (a.buffer_state !== state) await updateAssignment(a.id, { buffer_state: state });
  }
  return out;
}
