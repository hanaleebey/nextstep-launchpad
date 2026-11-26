#!/usr/bin/env node
// Run the security programme and write the evidence consumed by /test-report.
// Usage: node scripts/security-run.mjs
// Optional signed-in S2 inputs are read from the environment, never printed.
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { SECURITY_METHOD, SECURITY_OWNER_EMAIL, SECURITY_RESIDUAL_RISKS, SECURITY_SCOPE } from "../src/security/report-config.ts";

try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  // Environment variables may already be supplied by the caller or CI.
}
// Load environment before checks.ts reads the public Supabase configuration.
const { securityCases } = await import("../src/security/checks.ts");

const outputUrl = new URL("../public/security-results.json", import.meta.url);
let previous = null;
try {
  previous = JSON.parse(await readFile(outputUrl, "utf8"));
} catch {
  // First attack pass: no previous evidence, so nothing can be marked fixed.
}
const previousCases = new Map((previous?.cases ?? []).map((entry) => [entry.id, entry]));

const build = process.env["SECURITY_BUILD_COMMIT"] ?? execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
const runAt = new Date().toISOString();
const results = [];

for (const testCase of securityCases) {
  const result = await testCase.run();
  const prior = previousCases.get(testCase.id);
  const verifiedFix = prior?.verdict === "VULNERABLE" && (result.verdict === "BLOCKED" || result.verdict === "MITIGATED");
  const verificationAt = new Date().toISOString();
  results.push({
    id: testCase.id,
    area: testCase.area,
    attackSurface: testCase.attackSurface,
    payload: testCase.payload,
    expected: testCase.expected,
    executionSteps: testCase.executionSteps,
    evidenceFile: testCase.evidenceFile,
    ...result,
    fixed: verifiedFix,
    fix: verifiedFix ? result.fix : prior?.verdict === "VULNERABLE" && result.verdict === "VULNERABLE" ? "Fix absent or ineffective; re-attack still reports VULNERABLE." : result.fix,
    verification: `${verifiedFix ? "Re-attack passed" : result.verdict === "MANUAL" ? "Manual evidence recorded" : "Attack checked"} at ${verificationAt}. ${result.verification}`,
  });
}

const report = {
  project: "NextStep",
  owner: SECURITY_OWNER_EMAIL,
  build,
  runAt,
  method: SECURITY_METHOD,
  scope: SECURITY_SCOPE,
  residualRisks: SECURITY_RESIDUAL_RISKS,
  summary: {
    cases: results.length,
    blocked: results.filter((result) => result.verdict === "BLOCKED").length,
    vulnerable: results.filter((result) => result.verdict === "VULNERABLE").length,
    manual: results.filter((result) => result.verdict === "MANUAL").length,
    mitigated: results.filter((result) => result.verdict === "MITIGATED").length,
    fixed: results.filter((result) => result.fixed).length,
  },
  cases: results,
};
await writeFile(outputUrl, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const rows = results.map((result) => ({
  id: result.id,
  area: result.area,
  verdict: result.verdict,
  fixed: result.fixed ? "yes" : "no",
  ms: result.durationMs,
}));
const widths = {
  id: Math.max(2, ...rows.map((row) => row.id.length)),
  area: Math.max(4, ...rows.map((row) => row.area.length)),
  verdict: Math.max(7, ...rows.map((row) => row.verdict.length)),
  fixed: 5,
  ms: Math.max(4, ...rows.map((row) => String(row.ms).length)),
};
console.log(`\nNextStep security run — ${runAt} — build ${build}`);
console.log(`${"ID".padEnd(widths.id)}  ${"AREA".padEnd(widths.area)}  ${"VERDICT".padEnd(widths.verdict)}  ${"FIXED".padEnd(widths.fixed)}  ${"MS".padStart(widths.ms)}`);
for (const row of rows) {
  console.log(`${row.id.padEnd(widths.id)}  ${row.area.padEnd(widths.area)}  ${row.verdict.padEnd(widths.verdict)}  ${row.fixed.padEnd(widths.fixed)}  ${String(row.ms).padStart(widths.ms)}`);
}
console.log(`\nCases ${report.summary.cases} | BLOCKED ${report.summary.blocked} | MANUAL ${report.summary.manual} | VULNERABLE ${report.summary.vulnerable} | fixed after re-attack ${report.summary.fixed}`);
for (const result of results) console.log(`${result.id}: ${result.observed}`);
console.log(`\nWrote public/security-results.json`);

if (results.some((result) => result.verdict === "VULNERABLE")) process.exitCode = 1;
