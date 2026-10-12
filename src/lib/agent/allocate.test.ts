import { describe, expect, it } from "vitest";
import { allocateWeek, proportionalSplit, type AllocationInput } from "./allocate";

const now = new Date("2026-10-12T08:00:00Z"); // Monday
const start = new Date("2026-10-12T00:00:00Z");
const end = new Date("2026-10-19T00:00:00Z");
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString();

function input(over: Partial<AllocationInput>): AllocationInput {
  return { weeklyAvailableHours: 10, horizonStart: start, horizonEnd: end, now, signalItems: [], openEndedItems: [], ...over };
}

describe("proportional split", () => {
  it("splits by weight", () => {
    const m = proportionalSplit(
      [{ id: "a", weight: 3, floor: 0, cap: Infinity }, { id: "b", weight: 1, floor: 0, cap: Infinity }],
      400,
    );
    expect(m.get("a")).toBe(300);
    expect(m.get("b")).toBe(100);
  });

  it("gives the more urgent item the bigger share", () => {
    const r = allocateWeek(input({ openEndedItems: [{ id: "soon", dueAt: inDays(1) }, { id: "later", dueAt: inDays(4) }] }));
    const soon = r.allocations.find((x) => x.id === "soon")!.minutes;
    const later = r.allocations.find((x) => x.id === "later")!.minutes;
    expect(soon).toBeGreaterThan(later);
    expect(soon + later).toBeLessThanOrEqual(r.free);
  });

  it("only counts signal items due inside the horizon", () => {
    const r = allocateWeek(input({ signalItems: [{ id: "s1", estimatedMinutes: 100, dueAt: inDays(2) }, { id: "s2", estimatedMinutes: 999, dueAt: inDays(20) }] }));
    expect(r.signalLoad).toBe(100);
    expect(r.free).toBe(500);
  });
});

describe("floor / cap clamping", () => {
  it("raises a tiny share to the 30-minute floor", () => {
    const m = proportionalSplit(
      [{ id: "big", weight: 99, floor: 30, cap: Infinity }, { id: "tiny", weight: 1, floor: 30, cap: Infinity }],
      300,
    );
    expect(m.get("tiny")).toBe(30);
    expect(m.get("big")).toBe(270);
  });

  it("caps at the item's remaining work and redistributes the rest", () => {
    const r = allocateWeek(input({
      openEndedItems: [
        { id: "small", dueAt: inDays(1), remainingMinutes: 60 },
        { id: "other", dueAt: inDays(5) },
      ],
    }));
    expect(r.allocations.find((x) => x.id === "small")!.minutes).toBe(60);
    expect(r.allocations.find((x) => x.id === "other")!.minutes).toBe(540);
  });

  it("caps at the minutes left before the deadline", () => {
    const r = allocateWeek(input({ openEndedItems: [{ id: "x", dueAt: new Date(now.getTime() + 45 * 60_000).toISOString() }] }));
    expect(r.allocations[0]!.minutes).toBe(45);
  });

  it("never allocates more than R in total", () => {
    const r = allocateWeek(input({
      weeklyAvailableHours: 1,
      openEndedItems: [{ id: "a", dueAt: inDays(1) }, { id: "b", dueAt: inDays(2) }, { id: "c", dueAt: inDays(3) }],
    }));
    const total = r.allocations.reduce((s, a) => s + a.minutes, 0);
    expect(total).toBeLessThanOrEqual(r.free);
    expect(r.floorsExceedFree).toBe(true); // 3 × 30-min floors = 90 > 60 free
  });
});

describe("over capacity", () => {
  it("flags H >= C with the numbers", () => {
    const r = allocateWeek(input({
      weeklyAvailableHours: 2,
      signalItems: [{ id: "s", estimatedMinutes: 150, dueAt: inDays(1) }],
      openEndedItems: [{ id: "o", dueAt: inDays(3) }],
    }));
    expect(r).toMatchObject({ capacity: 120, signalLoad: 150, free: 0, overCapacity: true });
    expect(r.allocations[0]!.minutes).toBe(0);
  });
});
