// "Plan with AI": the student types an assignment + deadline, and the server
// asks the AI Gateway for timeboxed steps (deterministic fallback if AI fails).
// Also offers one-click step generation for saved assignments that have no
// schedulable steps. Data goes through the db layer; AI goes through a server fn.
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { createAssignment, listAssignments, listSteps } from "@/lib/db";
import { generateAiSteps } from "@/lib/agent/ai-steps.functions";
import { hasNoSchedulableSteps, saveGeneratedSteps } from "@/lib/agent/ai-steps-persist";
import type { DecomposedStep } from "@/lib/agent/decompose";
import type { Assignment } from "@/types/nextstep";

const TYPES = ["paper", "quiz", "reading", "discussion", "project"];

async function loadUnplanned(): Promise<Assignment[]> {
  const all = (await listAssignments()).filter((a) => a.status !== "done");
  const checks = await Promise.all(all.map(async (a) => ((hasNoSchedulableSteps(await listSteps(a.id))) ? a : null)));
  return checks.filter((a): a is Assignment => a !== null);
}

export function AiPlanPanel() {
  const qc = useQueryClient();
  const generate = useServerFn(generateAiSteps);
  const unplannedQ = useQuery({ queryKey: ["unplanned"], queryFn: loadUnplanned });
  const [title, setTitle] = useState("");
  const [type, setType] = useState("paper");
  const [due, setDue] = useState("");
  const [minutes, setMinutes] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ title: string; steps: DecomposedStep[]; source: "ai" | "fallback"; note: string | null } | null>(null);

  async function planFor(a: Assignment, kind: string, extra?: string) {
    setBusy(a.id);
    try {
      const r = await generate({ data: { title: a.title, type: kind, dueAt: a.due_at, estimatedMinutes: a.estimated_minutes, details: extra } });
      await saveGeneratedSteps(a.id, a.title, r.steps, r.source);
      setResult({ title: a.title, ...r });
      if (r.source === "fallback") toast.warning(`AI unavailable (${r.note}). Used the built-in planner instead.`);
      else toast.success(`Planned "${a.title}" in ${r.steps.length} steps`);
      await qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't plan this assignment");
    } finally {
      setBusy(null);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !due) return;
    const est = Number(minutes);
    setBusy("new");
    try {
      const a = await createAssignment({
        course_id: null, lms_assignment_id: null, title: title.trim(), due_at: new Date(due).toISOString(),
        status: "todo", estimated_minutes: est > 0 ? Math.round(est) : null, estimate_source: est > 0 ? "manual" : null,
        estimated_is_manual: est > 0,
      });
      await planFor(a, type, details.trim() || undefined);
      setTitle(""); setDue(""); setMinutes(""); setDetails("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the assignment");
      setBusy(null);
    }
  }

  const total = result?.steps.reduce((n, s) => n + s.timebox_minutes, 0) ?? 0;

  return (
    <section className="map-card" aria-labelledby="ai-plan-title" style={{ marginBottom: 16 }}>
      <h2 id="ai-plan-title"><Sparkles size={18} aria-hidden="true" style={{ display: "inline", marginRight: 6 }} />Plan an assignment with AI</h2>
      <p className="map-sub" style={{ marginBottom: 12 }}>Tell NextStep what's due. It breaks the work into small, timed steps you can start right away.</p>

      <form onSubmit={onSubmit} className="settings-form">
        <label>Assignment<input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Lab report on enzyme kinetics" /></label>
        <label>Type<select value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
        <label>Deadline<input required type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></label>
        <label>Your time estimate (minutes, optional)<input type="number" min={0} step={5} value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label>
        <label>Details (optional)<textarea rows={2} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Word count, prompt, rubric notes…" /></label>
        <div><button type="submit" className="exec-btn behind-accept" disabled={busy !== null}>
          {busy === "new" ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" />Planning…</> : "Generate steps"}
        </button></div>
      </form>

      {result && (
        <div style={{ marginTop: 16 }} role="status">
          <p className="map-meta" style={{ marginBottom: 8 }}>
            {result.source === "ai" ? <CheckCircle2 size={14} aria-hidden="true" style={{ display: "inline" }} /> : <AlertTriangle size={14} aria-hidden="true" style={{ display: "inline" }} />}{" "}
            {result.source === "ai" ? "AI plan" : "Built-in plan (AI unavailable)"} for <strong>{result.title}</strong> · {result.steps.length} steps · about {total} min
          </p>
          <ol style={{ paddingLeft: 20, listStyle: "decimal" }}>
            {result.steps.map((s) => (
              <li key={s.order_index} style={{ marginBottom: 6 }}>
                <strong>{s.title}</strong> <span className="tabular-nums map-meta">· {s.timebox_minutes} min</span>
                <div className="map-meta">Done when: {s.done_criteria.join("; ")}</div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <h3 style={{ marginTop: 20, marginBottom: 8, fontWeight: 600 }}>Assignments with no steps to schedule</h3>
      {unplannedQ.isLoading ? <p className="map-empty" role="status">Checking…</p>
        : unplannedQ.isError ? <p className="map-empty" role="alert">Couldn't load assignments.</p>
        : !unplannedQ.data?.length ? <p className="map-empty"><CheckCircle2 size={14} aria-hidden="true" style={{ display: "inline" }} /> Every open assignment has steps.</p>
        : (
          <ul style={{ display: "grid", gap: 8 }}>
            {unplannedQ.data.map((a) => (
              <li key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span>{a.title}{a.due_at && <span className="map-meta"> · due {new Date(a.due_at).toLocaleDateString()}</span>}</span>
                <button type="button" className="exec-btn exec-stopped" disabled={busy !== null} onClick={() => planFor(a, "project")}>
                  {busy === a.id ? "Planning…" : "Generate steps"}
                </button>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
