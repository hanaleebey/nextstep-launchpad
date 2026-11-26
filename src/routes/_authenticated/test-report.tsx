import { createFileRoute } from "@tanstack/react-router";
import { LockKeyhole } from "lucide-react";
import { NextStepShell } from "@/components/nextstep-shell";
import { SecurityReportView, type SecurityReport } from "@/components/security-report-view";
import { isSecurityOwner } from "@/security/report-config";

interface ReportLoad {
  report: SecurityReport | null;
  error: string | null;
}

export const Route = createFileRoute("/_authenticated/test-report")({
  head: () => ({
    meta: [
      { title: "Security test report — NextStep" },
      { name: "description", content: "Owner-only security and robustness evidence for NextStep." },
      { property: "og:title", content: "Security test report — NextStep" },
      { property: "og:description", content: "Security case evidence, fixes, and verification for NextStep." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  loader: async (): Promise<ReportLoad> => {
    try {
      const response = await fetch("/security-results.json", { cache: "no-store" });
      if (!response.ok) return { report: null, error: `Security results are unavailable (HTTP ${response.status}). Run node scripts/security-run.mjs first.` };
      return { report: await response.json() as SecurityReport, error: null };
    } catch {
      return { report: null, error: "Security results could not be loaded. Run node scripts/security-run.mjs first." };
    }
  },
  component: TestReportPage,
});

function TestReportPage() {
  const { user } = Route.useRouteContext();
  const { report, error } = Route.useLoaderData();
  const email = user.email ?? "";
  return (
    <NextStepShell email={email}>
      {!isSecurityOwner(email) ? (
        <div className="map-state" role="alert"><LockKeyhole size={24} aria-hidden="true" /><h1>Owner access required</h1><p>This evidence page is available only to the authorised NextStep owner.</p></div>
      ) : error || !report ? (
        <div className="map-state" role="alert"><LockKeyhole size={24} aria-hidden="true" /><h1>Report unavailable</h1><p>{error ?? "No security results were found."}</p></div>
      ) : <SecurityReportView report={report} />}
    </NextStepShell>
  );
}
