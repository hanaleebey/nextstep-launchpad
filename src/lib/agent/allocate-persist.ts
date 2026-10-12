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

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function recomputeWeeklyAllocations(now = new Date()): Promise<AllocationResult> {
  const settings = await getSettings();
  const { start, end } = weekHorizon(now);
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

  const weekStart = toISODate(start);
  const keep = new Set(result.allocations.map((x) => x.id));

  // One row per assignment per week; set the effective estimate.
  for (const { id, minutes } of result.allocations) {
    await upsertWeeklyAllocation({ assignment_id: id, week_start: weekStart, allocated_minutes: minutes });
    await updateAssignment(id, { estimated_minutes: minutes, estimate_source: "allocated" });
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
  return result;
}
