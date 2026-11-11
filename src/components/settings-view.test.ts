// Validation rules for the Settings page: weekly hours bounds and the
// danger-zone typed confirmation. Pure helpers, no Supabase involved.
import { describe, expect, it } from "vitest";
import { canResetData, validWeeklyHours, validateNewEmail, validateNewPassword } from "./settings-view";

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

describe("validateNewPassword", () => {
  it("rejects a new password shorter than 8 characters", () => {
    expect(validateNewPassword("oldpass1", "short", "short").next).toBe("Use at least 8 characters.");
  });

  it("rejects a new password that equals the current one", () => {
    expect(validateNewPassword("samepass1", "samepass1", "samepass1").next)
      .toBe("New password must be different from your current one.");
  });

  it("rejects a confirmation that does not match", () => {
    expect(validateNewPassword("oldpass1", "newpass1", "newpass2").confirm).toBe("Passwords don't match.");
  });

  it("accepts a valid change", () => {
    expect(validateNewPassword("oldpass1", "newpass1", "newpass1")).toEqual({});
  });
});

describe("validateNewEmail", () => {
  it("rejects an invalid format", () => {
    expect(validateNewEmail("not-an-email", "a@b.com")).toBe("Enter a valid email address.");
    expect(validateNewEmail("a@b", "a@b.com")).toBe("Enter a valid email address.");
  });

  it("rejects the current email, case-insensitively", () => {
    expect(validateNewEmail("A@B.com", "a@b.com")).toBe("That's already your current email.");
  });

  it("accepts a new valid email", () => {
    expect(validateNewEmail("new@school.edu", "a@b.com")).toBeNull();
  });
});
