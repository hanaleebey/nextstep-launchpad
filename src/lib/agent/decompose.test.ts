import { describe, expect, it } from "vitest";
import { decompose, normaliseType, stepCountFor, MAX_TIMEBOX, MIN_TIMEBOX, DEFAULT_TOTAL_MINUTES } from "./decompose";

const base = { title: "X", dueAt: "2026-10-20T00:00:00Z" };
const sum = (xs: { timebox_minutes: number }[]) => xs.reduce((s, x) => s + x.timebox_minutes, 0);

describe("decompose", () => {
  for (const type of ["paper", "quiz", "reading", "discussion", "project"]) {
    it(`${type}: 4–8 steps, valid timeboxes and checklists`, () => {
      for (const minutes of [30, 90, 180, 300, 600]) {
        const steps = decompose({ ...base, type, estimatedMinutes: minutes });
        expect(steps.length).toBeGreaterThanOrEqual(4);
        expect(steps.length).toBeLessThanOrEqual(8);
        steps.forEach((s, i) => {
          expect(s.order_index).toBe(i);
          expect(s.title.length).toBeGreaterThan(0);
          expect(s.timebox_minutes).toBeGreaterThanOrEqual(MIN_TIMEBOX);
          expect(s.timebox_minutes).toBeLessThanOrEqual(MAX_TIMEBOX);
          expect(s.done_criteria.length).toBeGreaterThanOrEqual(1);
          expect(s.done_criteria.length).toBeLessThanOrEqual(3);
        });
      }
    });
  }

  it("timeboxes sum to roughly the estimate (within 20%)", () => {
    for (const minutes of [120, 200, 300]) {
      const total = sum(decompose({ ...base, type: "paper", estimatedMinutes: minutes }));
      expect(Math.abs(total - minutes) / minutes).toBeLessThan(0.2);
    }
  });

  it("is deterministic", () => {
    const a = decompose({ ...base, type: "quiz", estimatedMinutes: 150 });
    const b = decompose({ ...base, type: "quiz", estimatedMinutes: 150 });
    expect(a).toEqual(b);
  });

  it("keeps the first and last essential steps when trimmed", () => {
    const steps = decompose({ ...base, type: "paper", estimatedMinutes: 60 });
    expect(steps[0].title).toMatch(/prompt/i);
    expect(steps[steps.length - 1].title).toMatch(/submit/i);
  });

  it("uses the default total when no estimate is given", () => {
    const steps = decompose({ ...base, type: "project", estimatedMinutes: null });
    expect(steps.length).toBe(stepCountFor(DEFAULT_TOTAL_MINUTES));
  });

  it("maps loose type names to templates", () => {
    expect(normaliseType("essay")).toBe("paper");
    expect(normaliseType("post")).toBe("discussion");
    expect(normaliseType("video")).toBe("reading");
    expect(normaliseType("anything")).toBe("project");
  });

  it("step count scales with the estimate", () => {
    expect(stepCountFor(30)).toBe(4);
    expect(stepCountFor(275)).toBe(6);
    expect(stepCountFor(1000)).toBe(8);
  });
});
