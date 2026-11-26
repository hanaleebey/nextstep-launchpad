import { readFileSync } from "node:fs";
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SecurityReportView, type SecurityReport } from "./security-report-view";
import { isSecurityOwner, SECURITY_OWNER_EMAIL } from "@/security/report-config";

const report = JSON.parse(readFileSync("public/security-results.json", "utf8")) as SecurityReport;
afterEach(cleanup);

describe("security evidence view", () => {
  it("renders every JSON case with its verdict and exact payload", () => {
    render(<SecurityReportView report={report} />);
    expect(document.querySelectorAll(".security-case")).toHaveLength(report.cases.length);
    for (const item of report.cases) {
      const section = document.getElementById(`case-${item.id}`)!;
      expect(within(section).getByText(item.verdict, { exact: true })).toBeInTheDocument();
      expect(within(section).getByTestId(`payload-${item.id}`).textContent).toBe(JSON.stringify(item.payload, null, 2));
      expect(section.textContent).toContain(item.verification);
      expect(section.textContent).toContain(item.evidenceFile);
    }
  });

  it("keeps the summary counts identical to the JSON", () => {
    const { container } = render(<SecurityReportView report={report} />);
    const values = [...container.querySelectorAll(".security-summary .map-stat-value")].map((node) => Number(node.textContent));
    expect(values).toEqual([report.summary.cases, report.summary.blocked, report.summary.manual, report.summary.fixed]);
  });
});

describe("owner-only evidence access", () => {
  it("accepts only the owner's email, case-insensitively", () => {
    expect(isSecurityOwner(SECURITY_OWNER_EMAIL)).toBe(true);
    expect(isSecurityOwner(SECURITY_OWNER_EMAIL.toUpperCase())).toBe(true);
    expect(isSecurityOwner("other@example.invalid")).toBe(false);
    expect(isSecurityOwner("")).toBe(false);
  });
});
