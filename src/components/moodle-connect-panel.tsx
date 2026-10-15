// The submitted token is cleared immediately and never retained in feedback.
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Cable, Check, CheckCircle2, ChevronDown, Eye, EyeOff, Loader2, LockKeyhole, ScanSearch, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getLmsConnection } from "@/lib/db";
import { connectMoodle } from "@/lib/lms/moodle-connect";

const STEPS = ["Connect your LMS", "Auto-detect work", "Confirm plan"];

export function MoodleConnectPanel() {
  const queryClient = useQueryClient();
  const connection = useQuery({ queryKey: ["lms-connection"], queryFn: getLmsConnection });
  const [siteUrl, setSiteUrl] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const activeStep = success || connection.data?.site_url ? 2 : 1;

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
        await queryClient.invalidateQueries({ queryKey: ["lms-connection"] });
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
        <section className="connect-card connect-detect" aria-labelledby="auto-detect-title">
          <div className="connect-card-heading"><ScanSearch size={20} aria-hidden="true" /><h2 id="auto-detect-title">Auto-detect this week</h2></div>
          <div className="connect-detect-placeholder"><ScanSearch size={36} strokeWidth={1.4} aria-hidden="true" /><p>Coming soon</p></div>
        </section>
      </div>
    </div>
  );
}