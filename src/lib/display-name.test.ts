// Display-name rules: trimming and the 40-char cap, the email local-part
// fallback, and the avatar initials shown in the top bar.
import { describe, expect, it } from "vitest";
import {
  DISPLAY_NAME_MAX, accountName, avatarInitials, emailLocalPart, normaliseDisplayName,
} from "./display-name";

describe("normaliseDisplayName", () => {
  it("trims surrounding whitespace", () => {
    expect(normaliseDisplayName("  Hana  ")).toBe("Hana");
  });

  it("caps at 40 characters", () => {
    const long = "x".repeat(DISPLAY_NAME_MAX + 10);
    expect(normaliseDisplayName(long)).toHaveLength(DISPLAY_NAME_MAX);
  });

  it("treats whitespace-only as empty (use the fallback)", () => {
    expect(normaliseDisplayName("   ")).toBe("");
  });
});

describe("emailLocalPart", () => {
  it("takes the part before the @", () => {
    expect(emailLocalPart("hana@example.com")).toBe("hana");
  });

  it("returns the whole string when there is no @", () => {
    expect(emailLocalPart("hana")).toBe("hana");
  });
});

describe("accountName", () => {
  it("prefers the display name", () => {
    expect(accountName("Hana", "hana@example.com")).toBe("Hana");
  });

  it("falls back to the email local-part when null or blank", () => {
    expect(accountName(null, "hana@example.com")).toBe("hana");
    expect(accountName("   ", "hana@example.com")).toBe("hana");
  });
});

describe("avatarInitials", () => {
  it("uses up to two initials from the display name, uppercased", () => {
    expect(avatarInitials("Audrie Hana Lee Bey", "a@b.com")).toBe("AH");
    expect(avatarInitials("hana", "a@b.com")).toBe("H");
  });

  it("falls back to the first letter of the email local-part", () => {
    expect(avatarInitials(null, "hana@example.com")).toBe("H");
    expect(avatarInitials("", "hana@example.com")).toBe("H");
  });
});
