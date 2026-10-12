// Recompute and save this week's allocation.
// Call this on: start of week, an item completing, a new sync, or a change to
// weekly_available_hours. Because it recomputes from scratch every time,
// capacity freed by finished items automatically flows to the rest.
import {
  deleteWeeklyAllocation, getSettings, listAssignments, listWeeklyAllocations,
  logActivity, updateAssignment, upsertWeeklyAllocation,
} from "@/lib/db";
import type { Assignment } from "@/types/nextstep";
import { allocateWeek, weekHorizon, type AllocationResult } from "./allocate";

/** Open-ended = not signal-estimated and not manually overridden. */
function isOpenEnded(a: Assignment): boolean {
  return !a.estimated_is_manual && a.estimate_source !== "signal";
}

/** Calendar date of `d` in the given timezone, as "YYYY-MM-DD". */
function toISODateUTC(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Why an item received 0 allocated minutes (shown per row on Settings). */
export type ZeroReason = "fixed work (signal)" | "fixed work (manual)" | "no free capacity" | "over capacity";

/**
 * @param horizon Optional week to plan for. Defaults to the local Mon–Sun week;
 *                the Settings page passes the week in the user's timezone.
 */
export async function recomputeWeeklyAllocations(
  now = new Date(),
  horizon?: { start: Date; end: Date },
): Promise<AllocationResult & { weekStart: string; reasons: Record<string, ZeroReason> }> {
  const settings = await getSettings();
  const { start, end } = horizon ?? weekHorizon(now);
  const active = (await listAssignments()).filter((a) => a.status !== "done");

  const result = allocateWeek({
    weeklyAvailableHours: Number(settings?.weekly_available_hours ?? 20),
    horizonStart: start,
    horizonEnd: end,
    now,
    // Fixed work: signal estimates and manual overrides both occupy capacity.
    signalItems: active
      .filter((a) => !isOpenEnded(a) && a.estimated_minutes != null)
      .map((a) => ({ id: a.id, estimatedMinutes: a.estimated_minutes!, dueAt: a.due_at })),
    openEndedItems: active.filter(isOpenEnded).map((a) => ({ id: a.id, dueAt: a.due_at })),
  });

  const weekStart = horizon ? toISODateUTC(start, settings?.timezone ?? "UTC") : toISODate(start);
  const keep = new Set(result.allocations.map((x) => x.id));

  // Debug trace so a silent "nothing allocated" is visible in the console.
  console.info("[allocate] week", weekStart, "result", result,
    "map", Object.fromEntries(result.allocations.map((x) => [x.id, x.minutes])));

  // One row per assignment per week; set the effective estimate.
  // Errors propagate (the caller shows them as a toast) — never fail silently.
  for (const { id, minutes } of result.allocations) {
    try {
      const row = await upsertWeeklyAllocation({ assignment_id: id, week_start: weekStart, allocated_minutes: minutes });
      console.info("[allocate] upserted", row);
      await updateAssignment(id, { estimated_minutes: minutes, estimate_source: "allocated" });
    } catch (err) {
      console.error("[allocate] persist failed for", id, err);
      throw new Error(`Saving allocation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Per-row reason for every item that ends up with 0 minutes.
  const reasons: Record<string, ZeroReason> = {};
  for (const a of active) {
    if (a.estimated_is_manual) reasons[a.id] = "fixed work (manual)";
    else if (a.estimate_source === "signal") reasons[a.id] = "fixed work (signal)";
  }
  for (const { id, minutes } of result.allocations) {
    if (minutes === 0) reasons[id] = result.overCapacity ? "over capacity" : "no free capacity";
  }
  // Drop this week's rows for items that no longer need a slice (e.g. completed).
  for (const row of await listWeeklyAllocations(weekStart)) {
    if (!keep.has(row.assignment_id)) await deleteWeeklyAllocation(row.id);
  }

  await logActivity(
    "estimate",
    result.overCapacity
      ? `Over capacity this week: ${result.signalLoad} min of fixed work vs ${result.capacity} min available.`
      : `Allocated ${result.free} free minutes across ${result.allocations.length} open-ended item(s).`,
  );
  return { ...result, weekStart, reasons };
}
