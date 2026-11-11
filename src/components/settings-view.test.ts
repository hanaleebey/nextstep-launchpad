// Validation rules for the Settings page: weekly hours bounds and the
// danger-zone typed confirmation. Pure helpers, no Supabase involved.
import { describe, expect, it } from "vitest";
import { canResetData, validWeeklyHours } from "./settings-view";

describe("validWeeklyHours", () => {
  it("accepts whole hours from 1 to 60", () => {
    expect(validWeeklyHours(1)).toBe(true);
    expect(validWeeklyHours(20)).toBe(true);
    expect(validWeeklyHours(60)).toBe(true);
  });

  it("rejects out-of-range, fractional and non-numeric values", () => {
    expect(validWeeklyHours(0)).toBe(false);
    expect(validWeeklyHours(61)).toBe(false);
    expect(validWeeklyHours(2.5)).toBe(false);
    expect(validWeeklyHours(Number("abc"))).toBe(false);
  });
});

describe("canResetData", () => {
  it("arms only on the exact word RESET", () => {
    expect(canResetData("RESET")).toBe(true);
  });

  it("stays disarmed for anything else", () => {
    expect(canResetData("")).toBe(false);
    expect(canResetData("reset")).toBe(false);
    expect(canResetData("RESET ")).toBe(false);
    expect(canResetData("RESE")).toBe(false);
  });
});
