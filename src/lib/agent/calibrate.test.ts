import { describe, expect, it } from "vitest";
import { checkSample, computeMultiplier, resolveSuspect, type Sample } from "./calibrate";
import { estimateCalibrated } from "./estimate";

const s = (estimated: number, actual: number | null, extra: Partial<Sample> = {}): Sample => ({
  item_type: "reading", estimated_minutes: estimated, actual_minutes: actual, ...extra,
});

describe("checkSample", () => {
  it("rejects a null actual as no_timer", () => expect(checkSample(s(30, null)).reason).toBe("no_timer"));
  it("rejects 0 as too_short", () => expect(checkSample(s(30, 0)).reason).toBe("too_short"));
  it("rejects a 4x outlier as timer_left_running", () => expect(checkSample(s(30, 120)).reason).toBe("timer_left_running"));
  it("rejects anything over 180 minutes", () => expect(checkSample(s(100, 200)).reason).toBe("timer_left_running"));
  it("accepts a normal sample", () => expect(checkSample(s(30, 36))).toEqual({ usable: true, reason: null, ratio: 1.2 }));
  it("keeps a confirmed slow session but caps its ratio at 1.8", () => {
    const kept = resolveSuspect(s(30, 252), { kind: "accurate" })!;
    expect(checkSample(kept).ratio).toBe(1.8);
  });
  it("discards a running timer by default, or uses a typed real time", () => {
    expect(resolveSuspect(s(30, 252), { kind: "dismissed" })).toBeNull();
    expect(resolveSuspect(s(30, 252), { kind: "kept_running", realMinutes: 40 })?.actual_minutes).toBe(40);
  });
});

describe("computeMultiplier", () => {
  it("leaves the multiplier unchanged with fewer than 3 usable samples", () => {
    const r = computeMultiplier([s(30, 45), s(30, 45)], 1.1);
    expect(r).toMatchObject({ multiplier: 1.1, changed: false, status: "insufficient" });
  });
  it("uses the median, not the mean", () => {
    // ratios 1.0, 1.0, 2.0(capped by 3x rule? 60/30=2 is usable) -> median 1.0, mean 1.33
    const r = computeMultiplier([s(30, 30), s(30, 30), s(30, 60)], 1);
    expect(r.multiplier).toBe(1);
  });
  it("clamps at 1.8 and 0.6 (with old=target so blending doesn't hide it)", () => {
    expect(computeMultiplier([s(30, 85), s(30, 85), s(30, 85)], 1.8).multiplier).toBe(1.8);
    expect(computeMultiplier([s(30, 5), s(30, 5), s(30, 5)], 0.6).multiplier).toBe(0.6);
  });
  it("blends halfway from the old multiplier", () => {
    expect(computeMultiplier([s(30, 45), s(30, 45), s(30, 45)], 1).multiplier).toBe(1.25);
  });
  it("trims highest and lowest with 5+ samples", () => {
    const r = computeMultiplier([s(30, 3), s(30, 30), s(30, 30), s(30, 30), s(30, 89)], 1);
    expect(r.multiplier).toBe(1);
  });
  it("resets to 1.0 when most samples are rejected", () => {
    const r = computeMultiplier([s(30, null), s(30, null), s(30, 0), s(30, 40)], 1.4);
    expect(r).toMatchObject({ multiplier: 1, status: "mostly_rejected" });
  });
});

describe("estimateCalibrated", () => {
  it("scales a reading estimate by the reading multiplier", () => {
    const r = estimateCalibrated({ kind: "read", signals: { wordCount: 2000 } }, { reading: 1.5 });
    expect(r.minutes).toBe(15);
  });
});
