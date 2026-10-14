// Step 1 of Connect: link a Moodle site. The token field is cleared right after
// submit and is never shown again; only the site URL and status are displayed.
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getLmsConnection } from "@/lib/db";
import { connectMoodle } from "@/lib/lms/moodle-connect";

export function MoodleConnectPanel() {
  const queryClient = useQueryClient();
  const connection = useQuery({ queryKey: ["lms-connection"], queryFn: getLmsConnection });
  const [siteUrl, setSiteUrl] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null); setSuccess(null); setBusy(true);
    const submittedToken = token.trim();
    setToken(""); // never keep the token around after submit
    try {
      const res = await connectMoodle(siteUrl.trim().replace(/\/+$/, ""), submittedToken);
      if (res.ok) {
        const msg = `Connected to ${res.siteName} as ${res.username || "you"}.`;
        setSuccess(msg); toast.success(msg);
        await queryClient.invalidateQueries({ queryKey: ["lms-connection"] });
      } else {
        setError(res.message); toast.error(res.message);
      }
    } finally { setBusy(false); }
  }

  const existing = connection.data;
  return (
    <section className="map-card mb-4" aria-labelledby="moodle-connect-title">
      <h2 id="moodle-connect-title" className="text-lg font-semibold">1. Connect your LMS</h2>
      <p className="text-sm text-muted-foreground">Link your Moodle account so NextStep can read your courses and due dates. Read-only — nothing is ever changed in Moodle.</p>
      {existing?.site_url && (
        <p className="mt-3 flex items-center gap-2 text-sm" role="status">
          <CheckCircle2 size={16} aria-hidden="true" className="text-[color:var(--green)]" />
          Connected: {existing.site_url}
        </p>
      )}
      <form onSubmit={onSubmit} className="mt-4 grid gap-3 sm:max-w-md">
        <div className="grid gap-1.5">
          <Label htmlFor="moodle-url">Moodle site URL</Label>
          <Input id="moodle-url" type="url" required placeholder="https://moodle.youruniversity.edu" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="moodle-token">Web services token</Label>
          <Input id="moodle-token" type="password" required autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
          <p className="text-xs text-muted-foreground">In Moodle: Profile → Preferences → Security keys. Stored encrypted and never shown again.</p>
        </div>
        <Button type="submit" disabled={busy || !siteUrl || !token}>
          {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
          {busy ? "Checking…" : existing ? "Reconnect" : "Connect"}
        </Button>
        {error && <p role="alert" className="flex items-center gap-2 text-sm text-destructive"><AlertTriangle size={16} aria-hidden="true" />{error}</p>}
        {success && <p role="status" className="flex items-center gap-2 text-sm"><CheckCircle2 size={16} aria-hidden="true" />{success}</p>}
      </form>
    </section>
  );
}
