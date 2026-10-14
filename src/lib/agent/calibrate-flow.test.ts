import { describe, expect, it } from "vitest";
import { sampleFromCompletion } from "./calibrate-flow";
import { checkSample, computeMultiplier, resolveSuspect } from "./calibrate";

describe("completion -> calibration sample", () => {
  it("no timer records actual null and excluded_reason no_timer", () => {
    const s = sampleFromCompletion("read", 30, 0, false)!;
    expect(s).toEqual({ item_type: "reading", estimated_minutes: 30, actual_minutes: null });
    expect(checkSample(s).reason).toBe("no_timer");
  });
  it("maps types to calibration buckets, never 'read'", () => {
    expect(sampleFromCompletion("paper", 30, 600, true)!.item_type).toBe("writing");
    expect(sampleFromCompletion("video", 30, 600, true)!.actual_minutes).toBe(10);
  });
  it("long-running timer is rejected unless confirmed", () => {
    const s = sampleFromCompletion("quiz", 30, 4 * 3600, true)!;
    expect(checkSample(s)).toMatchObject({ usable: false, reason: "timer_left_running" });
    expect(resolveSuspect(s, { kind: "dismissed" })).toBeNull();
    const ok = resolveSuspect(s, { kind: "accurate" })!;
    expect(checkSample(ok)).toMatchObject({ usable: true, ratio: 1.8 });
  });
  it("a fourth timed sample changes the multiplier", () => {
    const mk = (min: number) => sampleFromCompletion("read", 30, min * 60, true)!;
    const three = computeMultiplier([mk(45), mk(45), mk(45)], 1);
    const four = computeMultiplier([mk(45), mk(45), mk(45), mk(54)], three.multiplier);
    expect(four.changed).toBe(true);
    expect(four.multiplier).not.toBe(three.multiplier);
  });
});
