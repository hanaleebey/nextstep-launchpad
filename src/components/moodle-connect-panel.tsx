
// The submitted token is cleared immediately and never retained in feedback.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Cable, Check, CheckCircle2, ChevronDown, Eye, EyeOff, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getLmsConnection, getSettings, listDetectedItems } from "@/lib/db";
import { connectMoodle } from "@/lib/lms/moodle-connect";

import { syncMoodle } from "@/lib/lms/moodle-sync";
import { processMoodleSync } from "@/lib/lms/process-sync";
import { confirmConnectPlan, editDetectedEstimate, prepareConnectPlan, type ConnectPlanSummary } from "@/lib/agent/connect-plan";
import { DetectedWorkPanel } from "./detected-work-panel";
import type { DetectedItem } from "@/types/nextstep";

const STEPS = ["Connect your LMS", "Auto-detect work", "Plan ready"];

export function MoodleConnectPanel({ onComplete }: { onComplete?: () => void }) {
  const queryClient = useQueryClient();
  const connection = useQuery({ queryKey: ["lms-connection"], queryFn: getLmsConnection });
  const [siteUrl, setSiteUrl] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [items, setItems] = useState<DetectedItem[]>([]);
  const [summary, setSummary] = useState<ConnectPlanSummary | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [timezone, setTimezone] = useState("UTC");
  const started = useRef(false);
  const activeStep = summary ? 3 : success || connection.data?.site_url ? 2 : 1;

  /** Detect the week's work and plan it. Planning is automatic - there is no button. */
  async function detect() {
    setDetecting(true); setDetectError(null); setSummary(null);
    try {
      const settings = await getSettings();
      const zone = settings?.timezone ?? "UTC";
      setTimezone(zone);
      const synced = await syncMoodle();
      if (!synced.ok && !synced.partial) throw new Error("Moodle could not refresh your work. Try again.");
      setWarnings(synced.warnings);
      const detected = await processMoodleSync(synced, zone);
      setItems(detected); setReady(true);
      const plan = await prepareConnectPlan(detected);
      setSummary(plan);
      // Mark the detected items as seen. The student edits estimates inline if
      // they want to; nothing else is required of them.
      await confirmConnectPlan(detected);
      await queryClient.invalidateQueries({ queryKey: ["lms"] });
    } catch (e) { setDetectError(e instanceof Error ? e.message : "Could not detect your work. Try again."); }
    finally { setDetecting(false); }
  }

  useEffect(() => {
    if (!connection.data?.site_url || started.current) return;
    started.current = true;
    void (async () => {
      try {
        const cached = await listDetectedItems();
        if (cached.length) {
          setItems(cached); setReady(true);
          setTimezone((await getSettings())?.timezone ?? "UTC");
          // Existing steps are kept; only items still missing steps get planned.
          setSummary(await prepareConnectPlan(cached));
        } else await detect();
      } catch { setDetectError("Could not restore your detected work. Try again."); }
    })();
  }, [connection.data?.site_url]);

  /** Editing an estimate rebuilds that one assignment's steps against the new time. */
  async function edit(item: DetectedItem, minutes: number) {
    setSaving(true);
    try {
      const updated = await editDetectedEstimate(item, minutes);
      const next = items.map((row) => row.id === updated.id ? updated : row);
      setItems(next);
      setSummary(await prepareConnectPlan(next, updated.assignment_id ?? undefined));
    } finally { setSaving(false); }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null); setSuccess(null); setBusy(true);
    const submittedToken = token.trim();
    setToken("");
    setShowToken(false);
    try {
      const res = await connectMoodle(siteUrl.trim().replace(/\/+$/, ""), submittedToken);
      // Even a malformed service response must not echo the submitted secret.
      const safeText = (text: string) => submittedToken ? text.split(submittedToken).join("[redacted]") : text;
      if (res.ok) {
        setSuccess(safeText(`Connected to ${res.siteName} as ${res.username || "you"}.`));
        started.current = true;
        await queryClient.invalidateQueries({ queryKey: ["lms-connection"] });
        await detect();
      } else {
        setError(safeText(res.message));
      }
    } catch {
      setError("Couldn't reach the connection service. Try again in a moment.");
    } finally { setBusy(false); }
  }

  return (
    <div className="connect-onboarding">
      <header className="page-heading connect-heading">
        <h1>Get started</h1>
        <p>Connect once. NextStep keeps itself up to date after that.</p>
      </header>
      <ol className="connect-progress" aria-label="Connection progress">
        {STEPS.map((label, index) => {
          const number = index + 1;
          const state = number < activeStep ? "completed" : number === activeStep ? "active" : "pending";
          return <li key={label} className={`connect-progress-step ${state}`} aria-current={state === "active" ? "step" : undefined}>
            <span className="connect-step-circle" aria-hidden="true">{state === "completed" ? <Check size={18} /> : number}</span>
            <span className="connect-step-label">{label}<span className="sr-only"> — {state}</span></span>
            {number < 3 && <ArrowRight size={18} className="connect-step-arrow" aria-hidden="true" />}
          </li>;
        })}
      </ol>
      <div className="connect-grid">
        <section className="connect-card" aria-labelledby="moodle-connect-title">
          <div className="connect-card-heading"><Cable size={20} aria-hidden="true" /><h2 id="moodle-connect-title">Connect your LMS</h2></div>
          <form onSubmit={onSubmit} className="connect-form" aria-busy={busy}>
            <div className="grid gap-2">
              <Label htmlFor="moodle-url">Moodle site URL</Label>
              <Input id="moodle-url" type="url" required placeholder="https://moodle.example.edu" value={siteUrl} disabled={busy} onChange={(e) => setSiteUrl(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="moodle-token">Web services token</Label>
              <div className="connect-token-field">
                <Input id="moodle-token" type={showToken ? "text" : "password"} required autoComplete="off" spellCheck={false} value={token} disabled={busy} onChange={(e) => setToken(e.target.value)} />
                <Button type="button" variant="ghost" size="icon" className="connect-token-toggle" disabled={busy || !token} onClick={() => setShowToken(!showToken)} aria-label={showToken ? "Hide token" : "Show token"} aria-pressed={showToken} title={showToken ? "Hide token" : "Show token"}>
                  {showToken ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </Button>
              </div>
            </div>
            <p className="connect-helper"><LockKeyhole size={14} aria-hidden="true" />Stored encrypted on the server. Never shown or logged again.</p>
            <Button type="submit" size="lg" className="connect-submit" disabled={busy || !siteUrl.trim() || !token.trim()}>
              {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Cable aria-hidden="true" />}
              {busy ? "Connecting…" : "Connect to Moodle"}
            </Button>
            {error && <p role="alert" className="connect-feedback text-destructive"><AlertTriangle size={17} aria-hidden="true" />{error}</p>}
            {success && <p role="status" className="connect-feedback connect-success"><CheckCircle2 size={17} aria-hidden="true" />{success}</p>}
            {!success && connection.data?.site_url && <p role="status" className="connect-feedback connect-success"><CheckCircle2 size={17} aria-hidden="true" />Connected: {connection.data.site_url}</p>}
          </form>
          <p className="connect-readonly"><ShieldCheck size={17} aria-hidden="true" />Read-only connection. NextStep never changes anything in Moodle.</p>
          <details className="connect-token-help">
            <summary>Where do I get this token?<ChevronDown size={16} aria-hidden="true" /></summary>
            <p>A Moodle administrator may need to complete these steps:</p>
            <ol>
              <li>In Site administration → Advanced features, enable web services.</li>
              <li>Under Server → Web services → Manage protocols, enable REST.</li>
              <li>Under External services, create and enable a read-only service, add the Moodle functions NextStep needs, and authorize your user.</li>
              <li>Under Manage tokens, generate a token for your user and that service. Paste it above.</li>
            </ol>
          </details>
        </section>
        <DetectedWorkPanel items={items} summary={summary} busy={detecting} saving={saving} error={detectError} warnings={warnings} ready={ready} timezone={timezone} onRetry={() => void detect()} onEdit={edit} />
      </div>
    </div>
  );
}
