import { describe, expect, it, vi } from "vitest";
import { estimate, isComplex, refineEstimate, shouldRefine, stripHtml } from "./estimate";

const steps = [{ order_index: 0, title: "Read the prompt", timebox_minutes: 20, done_criteria: ["Noted the task"] }];
const ok = vi.fn(async () => ({ minutes: 90, confidence: "medium" as const, steps }));

describe("AI refinement gate", () => {
  it("strips HTML", () => {
    expect(stripHtml("<p>Write&nbsp;<b>500</b> words</p>")).toBe("Write 500 words");
  });
  it("refines low confidence", () => {
    expect(shouldRefine(estimate({ kind: "other" }), { title: "x", type: "quiz" })).toBe(true);
  });
  it("skips confident simple items without calling the model", async () => {
    const fn = vi.fn(ok);
    const base = estimate({ kind: "quiz", signals: { timeLimitSeconds: 1500 } });
    const r = await refineEstimate(base, { title: "Quiz", type: "quiz" }, fn);
    expect(fn).not.toHaveBeenCalled();
    expect(r.aiRefined).toBe(false);
  });
  it("treats rubric of 3+ or open-ended types as complex", () => {
    expect(isComplex({ title: "x", type: "quiz", rubric: ["a", "b", "c"] })).toBe(true);
    expect(isComplex({ title: "x", type: "paper" })).toBe(true);
  });
  it("upgrades with AI result", async () => {
    const r = await refineEstimate(estimate({ kind: "other" }), { title: "Essay", type: "paper", introHtml: "<p>Hi</p>" }, ok);
    expect(r).toMatchObject({ minutes: 90, aiRefined: true });
    expect(r.steps).toHaveLength(1);
  });
  it("keeps deterministic on null or throw", async () => {
    const base = estimate({ kind: "other" });
    expect((await refineEstimate(base, { title: "a", type: "paper" }, async () => null)).minutes).toBe(30);
    const r = await refineEstimate(base, { title: "a", type: "paper" }, async () => { throw new Error("down"); });
    expect(r).toMatchObject({ minutes: 30, aiRefined: false });
  });
});
