// Buffer engine (deterministic, no AI).
// slack (days) = days until deadline − remaining minutes / daily free minutes.
// GREEN > 1 day, AMBER 0..1 day, RED <= 0 ("No room to be behind").
// NOTE: for open-ended items the spec uses this week's allocation as
// "remaining minutes"; until capacity allocation exists we use the remaining
// signal estimate for every item.
import type { BufferState } from "@/types/nextstep";

export const DEFAULT_WEEKLY_HOURS = 20;
const DAY_MS = 86_400_000;

export function dailyFreeMinutes(weeklyHours = DEFAULT_WEEKLY_HOURS): number {
  return (weeklyHours * 60) / 7;
}

export function daysUntil(dueAt: string | null, now = Date.now()): number | null {
  return dueAt ? (new Date(dueAt).getTime() - now) / DAY_MS : null;
}

export function remainingMinutes(estimatedMinutes: number | null, progressPct: number): number {
  return Math.round((estimatedMinutes ?? 30) * (1 - progressPct / 100));
}

export function computeSlack(daysLeft: number | null, remaining: number, weeklyHours?: number): number {
  if (daysLeft === null) return Infinity; // no deadline → never at risk
  return daysLeft - remaining / dailyFreeMinutes(weeklyHours);
}

export function bufferStateFor(slack: number): BufferState {
  if (slack > 1) return "green";
  if (slack > 0) return "amber";
  return "red";
}

export const BUFFER_LABEL: Record<BufferState, string> = {
  green: "On track",
  amber: "Tight",
  red: "No room to be behind",
};
