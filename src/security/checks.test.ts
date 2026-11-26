// Fixture-only security checks. Network cases are deliberately excluded here;
// scripts/security-run.mjs owns those authorised, anonymous probes.
import { describe, expect, it } from "vitest";
import { securityCases } from "./checks";
import { validateMoodleConnectInput } from "../../supabase/functions/moodle-connect/validation";
import { finishStep, useExecuteSession } from "@/lib/session/execute-store";

describe("security case registry", () => {
  it("contains the six required attack surfaces and evidence filenames", () => {
    expect(securityCases.map((entry) => entry.id)).toEqual(["S1", "S2", "S3", "S4", "S5", "S6"]);
    expect(new Set(securityCases.map((entry) => entry.evidenceFile)).size).toBe(6);
    expect(securityCases.every((entry) => entry.executionSteps.length > 0)).toBe(true);
  });
});

describe("S3 stored XSS fixture", () => {
  it("renders both payloads as literal text", async () => {
    const result = await securityCases.find((entry) => entry.id === "S3")!.run();
    expect(result.verdict).toBe("BLOCKED");
  });
});

describe("S4 Moodle input boundary", () => {
  it.each([
    "http://169.254.169.254/latest/meta-data",
    "https://169.254.169.254/latest/meta-data",
    "https://127.0.0.1/admin",
    "https://10.0.0.4/",
    "https://localhost/",
    "file:///etc/passwd",
    "javascript:alert(1)",
  ])("rejects %s", (siteUrl) => {
    expect(validateMoodleConnectInput(siteUrl, "fixture-token").ok).toBe(false);
  });

  it("rejects a 10,000-character token", () => {
    expect(validateMoodleConnectInput("https://moodle.example.edu", "x".repeat(10_000)).ok).toBe(false);
  });

  it("keeps a normal public HTTPS Moodle URL valid", () => {
    const result = validateMoodleConnectInput("https://moodle.example.edu/", "x".repeat(32));
    expect(result).toEqual({ ok: true, siteUrl: "https://moodle.example.edu", token: "x".repeat(32) });
  });
});

describe("S6 rapid Done transitions", () => {
  it("accepts one transition and ignores the other 49", () => {
    const key = `vitest-${Date.now()}`;
    const accepted = Array.from({ length: 50 }, () => finishStep({ key, status: "done", elapsedSeconds: 1, timeboxSeconds: 1500 }));
    expect(accepted.filter(Boolean)).toHaveLength(1);
    expect(accepted.filter((value) => !value)).toHaveLength(49);
  });
});
