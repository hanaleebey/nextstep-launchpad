// Weekly capacity allocation for open-ended work (papers, projects, research).
// Pure functions only — persistence lives in allocate-persist.ts.
//
//   C = weekly_available_hours × 60           capacity minutes this week
//   H = Σ signal estimates due this week       fixed, bounded work
//   R = max(0, C − H)                           free capacity
//   H >= C  →  OVER CAPACITY (red): the week is not physically possible.
//
// R is split across open-ended items due in the horizon, proportionally to
// urgency, each clamped to [floor, cap]:
//   floor = 30 min (nothing gets zero; lower only if cap is smaller)
//   cap   = minutes left before the item's deadline (and its remaining work,
//           when known) — so we only ever allocate THIS WEEK's slice.
// Whatever an item can't use (it hit its cap) is redistributed to the others.

export const FLOOR_MINUTES = 30;
const MIN_PER_DAY = 1440;

export interface SignalItem {
  id: string;
  estimatedMinutes: number;
  dueAt: string | null;
}

export interface OpenEndedItem {
  id: string;
  dueAt: string | null;
  /** Work left on the whole item, if known. Caps the weekly slice. */
  remainingMinutes?: number | null;
}

export interface AllocationInput {
  weeklyAvailableHours: number;
  horizonStart: Date; // start of this week
  horizonEnd: Date; // start of next week
  now: Date;
  signalItems: SignalItem[];
  openEndedItems: OpenEndedItem[];
}

export interface AllocationResult {
  capacity: number; // C
  signalLoad: number; // H
  free: number; // R
  /** H >= C: the UI must tell the student the week doesn't fit. */
  overCapacity: boolean;
  /** Floors alone exceed R: every item got an equal, smaller slice. */
  floorsExceedFree: boolean;
  allocations: { id: string; minutes: number }[];
}

/** Due within [horizonStart, horizonEnd)? Items with no due date are excluded. */
export function isDueInHorizon(dueAt: string | null, start: Date, end: Date): boolean {
  if (!dueAt) return false;
  const t = new Date(dueAt).getTime();
  return t >= start.getTime() && t < end.getTime();
}

/**
 * Urgency weight. Sooner deadline → bigger share. We use 1 / days-until-due
 * (min half a day, so due-today items don't divide by zero).
 */
export function urgencyWeight(dueAt: string, now: Date): number {
  const days = (new Date(dueAt).getTime() - now.getTime()) / (MIN_PER_DAY * 60_000);
  return 1 / Math.max(0.5, days);
}

/** Minutes left before the deadline, further limited by remaining work if known. */
export function capFor(item: OpenEndedItem, now: Date): number {
  const untilDue = item.dueAt ? Math.max(0, (new Date(item.dueAt).getTime() - now.getTime()) / 60_000) : Infinity;
  const work = item.remainingMinutes ?? Infinity;
  return Math.floor(Math.min(untilDue, work));
}

interface Bounded { id: string; weight: number; floor: number; cap: number }

/**
 * Split `free` minutes proportionally to weight, respecting each item's
 * floor and cap ("water-filling"):
 *   1. Give every unsettled item its proportional share of what's left.
 *   2. Anyone below their floor or above their cap is pinned there and removed.
 *   3. Repeat with the remaining minutes until nobody violates a bound.
 * This is also how freed capacity redistributes: minutes an item can't use
 * (cap) flow to the others on the next pass.
 */
export function proportionalSplit(items: Bounded[], free: number): Map<string, number> {
  const result = new Map<string, number>();
  let active = [...items];
  let left = free;

  while (active.length > 0) {
    const totalWeight = active.reduce((s, i) => s + i.weight, 0);
    const shares = active.map((i) => ({ i, share: totalWeight > 0 ? (left * i.weight) / totalWeight : 0 }));
    const pinned = shares.filter(({ i, share }) => share < i.floor || share > i.cap);

    if (pinned.length === 0) {
      shares.forEach(({ i, share }) => result.set(i.id, Math.floor(share)));
      break;
    }
    for (const { i, share } of pinned) {
      const value = share < i.floor ? i.floor : i.cap;
      result.set(i.id, value);
      left -= value;
    }
    active = active.filter((i) => !pinned.some((p) => p.i === i));
    left = Math.max(0, left);
  }
  return result;
}

/** Compute this week's allocation. Pure and deterministic. */
export function allocateWeek(input: AllocationInput): AllocationResult {
  const { horizonStart, horizonEnd, now } = input;
  const C = Math.round(input.weeklyAvailableHours * 60);
  const H = input.signalItems
    .filter((s) => isDueInHorizon(s.dueAt, horizonStart, horizonEnd))
    .reduce((sum, s) => sum + s.estimatedMinutes, 0);
  const R = Math.max(0, C - H);
  const overCapacity = H >= C;

  const openInWeek = input.openEndedItems.filter((o) => isDueInHorizon(o.dueAt, horizonStart, horizonEnd));
  const bounded: Bounded[] = openInWeek.map((o) => {
    const cap = capFor(o, now);
    return { id: o.id, weight: urgencyWeight(o.dueAt!, now), cap, floor: Math.min(FLOOR_MINUTES, cap) };
  });

  // Edge case: floors alone don't fit in R. Keep the total within R by
  // giving everyone an equal slice (still never more than their cap).
  const floorSum = bounded.reduce((s, b) => s + b.floor, 0);
  const floorsExceedFree = bounded.length > 0 && floorSum > R;

  let split: Map<string, number>;
  if (floorsExceedFree) {
    const each = Math.floor(R / bounded.length);
    split = new Map(bounded.map((b) => [b.id, Math.min(each, b.cap)]));
  } else {
    split = proportionalSplit(bounded, R);
  }

  return {
    capacity: C,
    signalLoad: H,
    free: R,
    overCapacity,
    floorsExceedFree,
    allocations: bounded.map((b) => ({ id: b.id, minutes: split.get(b.id) ?? 0 })),
  };
}

/** Monday 00:00 (local) of the week containing `d`, and the next Monday. */
export function weekHorizon(d: Date): { start: Date; end: Date } {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}
