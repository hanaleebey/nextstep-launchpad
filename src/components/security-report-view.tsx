// Owner-only evidence presentation. The JSON is produced by security-run.mjs;
// this view never executes attacks, LMS calls, or AI requests.
import { AlertTriangle, CheckCircle2, ClipboardCheck, FileImage, Hand, ShieldCheck, Wrench } from "lucide-react";
import type { ReactNode } from "react";

export interface SecurityResult {
  id: string;
  area: string;
  attackSurface: string;
  payload: unknown;
  expected: string;
  executionSteps: string[];
  evidenceFile: string;
  verdict: "BLOCKED" | "VULNERABLE" | "MANUAL" | "MITIGATED";
  observed: string;
  durationMs: number;
  fixed: boolean;
  fix: string;
  verification: string;
  manualSteps?: string[];
}

export interface SecurityReport {
  project: string;
  owner: string;
  build: string;
  runAt: string;
  method: string[];
  scope: string[];
  residualRisks: string[];
  summary: { cases: number; blocked: number; vulnerable: number; manual: number; mitigated: number; fixed: number };
  cases: SecurityResult[];
}

function VerdictBadge({ verdict }: { verdict: SecurityResult["verdict"] }) {
  const Icon = verdict === "BLOCKED" ? CheckCircle2 : verdict === "MANUAL" ? Hand : AlertTriangle;
  return <span className={`security-verdict security-${verdict.toLowerCase()}`}><Icon size={14} aria-hidden="true" />{verdict}</span>;
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return <div className="security-block"><h3>{label}</h3>{children}</div>;
}

export function SecurityReportView({ report }: { report: SecurityReport }) {
  return (
    <div className="map-view security-report">
      <header className="map-header security-report-header">
        <div>
          <p className="exec-eyebrow"><ShieldCheck size={15} aria-hidden="true" />Owner evidence</p>
          <h1>Security and robustness report</h1>
          <p className="map-sub">NextStep · build <code>{report.build}</code> · run <time dateTime={report.runAt}>{new Date(report.runAt).toLocaleString()}</time></p>
        </div>
        <span className="security-owner"><ClipboardCheck size={16} aria-hidden="true" />Authorised owner only</span>
      </header>

      <section className="map-stats security-summary" aria-label="Security run summary">
        <div className="map-stat"><span className="map-stat-label">Cases</span><span className="map-stat-value">{report.summary.cases}</span></div>
        <div className="map-stat"><span className="map-stat-label">Blocked</span><span className="map-stat-value">{report.summary.blocked}</span></div>
        <div className="map-stat"><span className="map-stat-label">Manual</span><span className="map-stat-value">{report.summary.manual}</span></div>
        <div className="map-stat"><span className="map-stat-label">Fixed after re-attack</span><span className="map-stat-value">{report.summary.fixed}</span></div>
      </section>

      {report.summary.vulnerable > 0 && <p className="behind-alert" role="alert"><AlertTriangle size={20} aria-hidden="true" /><span>{report.summary.vulnerable} vulnerable case(s) remain. The runner exits non-zero.</span></p>}

      <section className="map-card security-method" aria-labelledby="security-method-title">
        <h2 id="security-method-title">Method and scope</h2>
        <ol>{report.method.map((step) => <li key={step}>{step}</li>)}</ol>
        <ul>{report.scope.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>

      <div className="security-case-list">
        {report.cases.map((result) => (
          <section className="map-card security-case" id={`case-${result.id}`} key={result.id} aria-labelledby={`case-title-${result.id}`}>
            <div className="security-case-head">
              <div><span className="course-chip">{result.id}</span><h2 id={`case-title-${result.id}`}>{result.area}</h2></div>
              <div className="security-badges"><VerdictBadge verdict={result.verdict} />{result.fixed && <span className="security-fixed"><Wrench size={13} aria-hidden="true" />FIXED + RE-TESTED</span>}</div>
            </div>
            <dl className="security-meta"><div><dt>Duration</dt><dd>{result.durationMs} ms</dd></div><div><dt>Evidence file</dt><dd><code>{result.evidenceFile}</code></dd></div></dl>
            <Block label="Attack surface"><p>{result.attackSurface}</p></Block>
            <Block label="Expected"><p>{result.expected}</p></Block>
            <details className="security-payload">
              <summary>Exact payload used</summary>
              <pre data-testid={`payload-${result.id}`}>{JSON.stringify(result.payload, null, 2)}</pre>
            </details>
            <Block label="Execution steps"><ol>{result.executionSteps.map((step) => <li key={step}>{step}</li>)}</ol></Block>
            <Block label="Observed response"><p className="security-observed">{result.observed}</p></Block>
            <Block label="Fix applied"><p>{result.fix}</p></Block>
            <Block label="Verification"><p className="security-verification"><CheckCircle2 size={16} aria-hidden="true" />{result.verification}</p></Block>
            {result.manualSteps && <Block label="Owner manual steps"><ol className="security-manual-steps">{result.manualSteps.map((step) => <li key={step}>{step}</li>)}</ol></Block>}
            <div className="security-evidence-slot"><FileImage size={20} aria-hidden="true" /><div><strong>Screenshot slot</strong><p>Save as <code>public/evidence/{result.evidenceFile}</code>. The PDF generator embeds it when present and otherwise keeps a labelled placeholder.</p></div></div>
          </section>
        ))}
      </div>

      <section className="map-card" aria-labelledby="residual-title">
        <h2 id="residual-title">Residual risks and manual work</h2>
        <ul className="security-residual">{report.residualRisks.map((risk) => <li key={risk}>{risk}</li>)}</ul>
      </section>
    </div>
  );
}
