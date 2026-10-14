import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({}));
import { bufferStateFor, computeSlack, remainingMinutesFor, whyThisNow, BUFFER_LABEL } from "./buffer";

const now = new Date("2026-10-14T12:00:00Z");
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString();

describe("bufferStateFor boundaries", () => {
  it("exactly 0 is red", () => expect(bufferStateFor(0)).toBe("red"));
  it("negative is red", () => expect(bufferStateFor(-2.5)).toBe("red"));
  it("just above 0 is amber", () => expect(bufferStateFor(0.001)).toBe("amber"));
  it("exactly 1 is amber", () => expect(bufferStateFor(1)).toBe("amber"));
  it("large slack is green", () => expect(bufferStateFor(30)).toBe("green"));
  it("red label", () => expect(BUFFER_LABEL.red).toBe("No room to be behind"));
});

describe("computeSlack", () => {
  // 14h/week → 120 min/day
  it("exactly 0 when work fills every free minute", () => {
    expect(computeSlack(inDays(2), 240, 14, now)).toBeCloseTo(0);
  });
  it("negative when work exceeds time", () => {
    expect(computeSlack(inDays(1), 360, 14, now)).toBeCloseTo(-2);
  });
  it("large slack for far deadlines", () => {
    expect(computeSlack(inDays(40), 60, 14, now)).toBeCloseTo(39.5);
  });
  it("no deadline is Infinity", () => expect(computeSlack(null, 999, 14, now)).toBe(Infinity));
  it("zero capacity with work left is red", () => {
    expect(bufferStateFor(computeSlack(inDays(5), 30, 0, now))).toBe("red");
  });
});

describe("remainingMinutesFor", () => {
  it("open-ended uses weekly allocation, not estimate", () => {
    expect(remainingMinutesFor({ estimate_source: "allocated", estimated_is_manual: false, estimated_minutes: 900, progress_pct: 0 }, 120)).toBe(120);
  });
  it("signal uses estimate × remaining progress", () => {
    expect(remainingMinutesFor({ estimate_source: "signal", estimated_is_manual: false, estimated_minutes: 100, progress_pct: 25 }, 500)).toBe(75);
  });
});

describe("whyThisNow", () => {
  it("mentions no room when red", () => {
    expect(whyThisNow({ title: "Essay", dueAt: inDays(1), remaining: 300, slack: -1 })).toMatch(/No room to be behind/);
  });
  it("mentions spare time when green", () => {
    expect(whyThisNow({ title: "Quiz", dueAt: inDays(5), remaining: 30, slack: 4.7 })).toMatch(/4.7 days of spare time/);
  });
});
