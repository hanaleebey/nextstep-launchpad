import { describe, expect, it } from "vitest";
import { sanitizeAiSteps } from "./ai-steps";
import { hasNoSchedulableSteps } from "./ai-steps-persist";

const step = (t: number) => ({ title: "Do it", timebox_minutes: t, done_criteria: ["a", "b", "c", "d"] });

describe("sanitizeAiSteps", () => {
  it("clamps timeboxes to 15–50 and criteria to 3", () => {
    const out = sanitizeAiSteps({ steps: [step(3), step(90), step(22), step(40)] })!;
    expect(out.map((s) => s.timebox_minutes)).toEqual([3, 50, 22, 40]);
    expect(out[0]!.done_criteria).toHaveLength(3);
  });
  it("caps at 8 steps and rejects fewer than 4", () => {
    expect(sanitizeAiSteps({ steps: Array(12).fill(step(20)) })).toHaveLength(8);
    expect(sanitizeAiSteps({ steps: [step(4)] })![0]!.timebox_minutes).toBe(4); // one-step plans (a video) are valid
    expect(sanitizeAiSteps("garbage")).toBeNull();
  });
});

describe("hasNoSchedulableSteps", () => {
  it("is true when every step is finished or there are none", () => {
    expect(hasNoSchedulableSteps([])).toBe(true);
    expect(hasNoSchedulableSteps([{ status: "done" }, { status: "stopped" }])).toBe(true);
    expect(hasNoSchedulableSteps([{ status: "blocked" }])).toBe(false);
  });
});
