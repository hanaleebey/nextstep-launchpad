import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({}));
import { placeSteps, orderSteps, recommendPlan, simulate, summarize, type PlanItem } from "./replan";

const now = new Date(2026, 9, 14, 8, 0);
const due = (d: number) => new Date(2026, 9, 14 + d, 23, 0).toISOString();
const steps = (id: string, n: number, m: number) => Array.from({ length: n }, (_, i) => ({ id: `${id}${i}`, title: `s${i}`, minutes: m }));

describe("placement", () => {
  it("fills days in order and respects daily capacity", () => {
    const items: PlanItem[] = [{ id: "a", title: "A", dueAt: due(3), steps: steps("a", 4, 50) }];
    const placed = placeSteps(orderSteps(items, now), 100);
    expect(placed.map((p) => p.dayIndex)).toEqual([0, 0, 1, 1]);
  });
  it("moves blocked steps to the back of their item", () => {
    const items: PlanItem[] = [{ id: "a", title: "A", dueAt: due(3), steps: [{ id: "x", title: "x", minutes: 10, blocked: true }, { id: "y", title: "y", minutes: 10 }] }];
    expect(orderSteps(items, now).map((q) => q.step.id)).toEqual(["y", "x"]);
  });
});

describe("recommendation", () => {
  it("triage when everything fits (least dropped work)", () => {
    const items: PlanItem[] = [{ id: "a", title: "A", dueAt: due(2), steps: steps("a", 2, 30) }];
    expect(recommendPlan(items, "a", 14, now).recommended.option).toBe("triage");
  });
  it("compress when that is the only way to keep the deadline", () => {
    // 120 min/day; 4×50 = 200 due today → triage misses, compress (4×30=120) fits.
    const items: PlanItem[] = [{ id: "a", title: "A", dueAt: due(0), steps: steps("a", 4, 50) }];
    const r = recommendPlan(items, "a", 14, now);
    expect(r.recommended.option).toBe("compress");
    expect(r.recommended.missed).toEqual([]);
  });
  it("partial counts dropped work as a missed deadline", () => {
    const items: PlanItem[] = [{ id: "a", title: "A", dueAt: due(0), steps: steps("a", 6, 50) }];
    const p = simulate("partial", items, "a", 120, now);
    expect(p.droppedMinutes).toBeGreaterThan(0);
    expect(p.missed).toContain("a");
  });
  it("summary mentions the option", () => {
    const items: PlanItem[] = [{ id: "a", title: "A", dueAt: due(2), steps: steps("a", 2, 30) }];
    const { recommended } = recommendPlan(items, null, 14, now);
    expect(summarize(recommended, items, "blocked")).toMatch(/A step was blocked\. Applied "Triage now"/);
  });
});
