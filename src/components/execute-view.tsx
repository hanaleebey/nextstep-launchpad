// Execute tab: one next action at a time.
// Selection rule (decision offloading): take the most urgent assignment
// (least slack) that still has a "todo" step, and hand over its first todo step.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { runReplan } from "@/lib/agent/replan";
import { AlertTriangle, Check, CircleCheckBig, Hand, Loader2, Pause, Play, Square } from "lucide-react";
import { loadMapData, BufferChip } from "@/components/map-view";
import { bufferStateFor, computeSlack, daysUntil, remainingMinutes, BUFFER_LABEL } from "@/lib/engine/buffer";
import { finishStep, stepKey, useExecuteSession } from "@/lib/session/execute-store";
import type { StepStatus } from "@/types/nextstep";
import { checkSample, resolveSuspect, suspectPrompt, type Sample, type SuspectAnswer } from "@/lib/agent/calibrate";
import { sampleFromCompletion, saveCompletionSample } from "@/lib/agent/calibrate-flow";

/** Save a sample, recalibrate, and toast the plain-language result. Never blocks completion. */
function recordAndCalibrate(lmsAssignmentId: string, sample: Sample) {
  saveCompletionSample(lmsAssignmentId, sample)
    .then(({ saved, messages }) => {
      if (!saved) return; // sample LMS data has no saved assignment to attach timings to
      const m = messages.find((x) => x.toLowerCase().includes(sample.item_type));
      if (m) toast(m);
    })
    .catch((e) => toast.error(`Couldn't save the timing: ${e instanceof Error ? e.message : String(e)}`));
}

interface Pending { lmsAssignmentId: string; sample: Sample }

function fmtClock(sec: number) {
  const m = Math.floor(Math.abs(sec) / 60);
  const s = Math.abs(sec) % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
function fmtMinutes(min: number) {
  const h = Math.floor(min / 60);
  return h ? `${h}h ${min % 60}m` : `${min}m`;
}
function fmtDue(dueAt: string | null, days: number | null) {
  if (!dueAt || days === null) return "No due date";
  if (days < 1) return `today (${Math.max(1, Math.round(days * 24))}h left)`;
  return `in ${Math.round(days)} days`;
}

export function ExecuteView() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["lms", "map"], queryFn: loadMapData });
  const session = useExecuteSession();
  const [pending, setPending] = useState<Pending | null>(null);

  if (isLoading) return <div className="map-state" role="status"><Loader2 size={22} aria-hidden="true" />Picking your next action…</div>;
  if (isError || !data) return <div className="map-state" role="alert"><AlertTriangle size={22} aria-hidden="true" />Couldn't load your work.</div>;

  const code = new Map(data.courses.map((c) => [c.lmsCourseId, c.code]));

  // Apply this session's status overrides, then rank by slack (most urgent first).
  const ranked = data.assignments
    .map((a) => {
      const steps = (a.steps ?? []).map((s) => ({
        ...s,
        status: session.overrides[stepKey(a.lmsAssignmentId, s.orderIndex)] ?? s.status,
      }));
      const doneCount = steps.filter((s) => s.status !== "todo").length;
      const progress = steps.length ? Math.round((doneCount / steps.length) * 100) : a.progressPct;
      const days = daysUntil(a.dueAt);
      const remaining = remainingMinutes(a.estimatedMinutes, progress);
      const slack = computeSlack(days, remaining);
      return { a, steps, progress, days, remaining, slack, state: bufferStateFor(slack) };
    })
    .sort((x, y) => x.slack - y.slack);

  const current = ranked.find((r) => r.steps.some((s) => s.status === "todo"));

  // Session stats.
  const focusSec = session.finished.reduce((s, f) => s + f.elapsedSeconds, 0);
  const completed = session.finished.filter((f) => f.status === "done").length;
  const hit = session.finished.filter((f) => f.elapsedSeconds <= f.timeboxSeconds).length;
  const hitRate = session.finished.length ? Math.round((hit / session.finished.length) * 100) : null;

  if (!current) {
    return <div className="map-state"><CircleCheckBig size={22} aria-hidden="true" />Nothing left to do right now. Nice work.</div>;
  }

  const step = current.steps.find((s) => s.status === "todo")!;
  const upNext = ranked
    .flatMap((r) => r.steps.filter((s) => s.status === "todo").map((s) => ({ r, s })))
    .filter((x) => !(x.r === current && x.s.orderIndex === step.orderIndex))
    .slice(0, 2);

  const why =
    `${current.a.title} is your most urgent assignment — due ${fmtDue(current.a.dueAt, current.days)}, ` +
    `buffer "${BUFFER_LABEL[current.state]}". This is its first unfinished step.`;

  return (
    <div className="exec-grid">
      <div className="exec-main">
      {pending && (
        <SuspectCheck
          sample={pending.sample}
          onAnswer={(answer) => {
            const resolved = resolveSuspect(pending.sample, answer);
            if (resolved) recordAndCalibrate(pending.lmsAssignmentId, resolved);
            setPending(null);
          }}
        />
      )}
      <ActionCard
        lmsAssignmentId={current.a.lmsAssignmentId}
        itemType={current.a.itemType}
        onSuspect={(sample) => setPending({ lmsAssignmentId: current.a.lmsAssignmentId, sample })}
        key={stepKey(current.a.lmsAssignmentId, step.orderIndex)}
        stepId={stepKey(current.a.lmsAssignmentId, step.orderIndex)}
        context={`${code.get(current.a.lmsCourseId)} · ${current.a.title} · step ${step.orderIndex + 1} of ${current.steps.length}`}
        title={step.title}
        criteria={step.doneCriteria}
        timeboxMinutes={step.timeboxMinutes}
        why={why}
      />
      </div>
      <aside className="map-aside">
        <section className="map-card" aria-labelledby="up-next">
          <h2 id="up-next">Up next</h2>
          {upNext.length === 0 ? <p className="map-empty">Nothing queued.</p> : (
            <ol className="exec-next">
              {upNext.map(({ r, s }) => (
                <li key={stepKey(r.a.lmsAssignmentId, s.orderIndex)}>
                  <span className="course-chip">{code.get(r.a.lmsCourseId)}</span>
                  <span className="exec-next-title">{s.title}</span>
                  <span className="map-block-min">{s.timeboxMinutes}m</span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="map-card" aria-labelledby="this-assignment">
          <h2 id="this-assignment">This assignment</h2>
          <div className="map-progress" role="progressbar" aria-valuenow={current.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Assignment progress"><span style={{ width: `${current.progress}%` }} /></div>
          <dl className="exec-dl">
            <dt>Progress</dt><dd>{current.progress}%</dd>
            <dt>Buffer</dt><dd><BufferChip state={current.state} /></dd>
            <dt>Estimated left</dt><dd>{fmtMinutes(current.remaining)}</dd>
            <dt>Due</dt><dd>{fmtDue(current.a.dueAt, current.days)}</dd>
          </dl>
        </section>
        <section className="map-card" aria-labelledby="today-session">
          <h2 id="today-session">Today's session</h2>
          <dl className="exec-dl">
            <dt>Focus time</dt><dd className="tabular-nums">{fmtMinutes(Math.round(focusSec / 60))}</dd>
            <dt>Steps completed</dt><dd className="tabular-nums">{completed}</dd>
            <dt>Timebox hit rate</dt><dd className="tabular-nums">{hitRate === null ? "—" : `${hitRate}%`}</dd>
          </dl>
        </section>
      </aside>
    </div>
  );
}

function ActionCard(props: {
  stepId: string; lmsAssignmentId: string; itemType: string; onSuspect: (s: Sample) => void; context: string; title: string; criteria: string[]; timeboxMinutes: number; why: string;
}) {
  const total = props.timeboxMinutes * 60;
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [checked, setChecked] = useState<boolean[]>(() => props.criteria.map(() => false));

  // Tick once per second while running; stop automatically when the timebox rings.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  useEffect(() => {
    if (elapsed >= total) setRunning(false);
  }, [elapsed, total]);

  const left = Math.max(0, total - elapsed);
  const timeUp = left === 0;
  const R = 70;
  const C = 2 * Math.PI * R;

  const queryClient = useQueryClient();
  function finish(status: StepStatus) {
    // Calibration: Done and Stopped are completions; never 0 for an unstarted timer.
    if (status !== "blocked") {
      const sample = sampleFromCompletion(props.itemType, props.timeboxMinutes, elapsed, elapsed > 0);
      if (sample) {
        const check = checkSample(sample);
        if (check.reason === "timer_left_running") props.onSuspect(sample);
        else recordAndCalibrate(props.lmsAssignmentId, sample);
      }
    }
    finishStep({ key: props.stepId, status, elapsedSeconds: elapsed, timeboxSeconds: total });
    // A blocked step triggers a re-plan: buffers are recomputed, steps are
    // moved into free time, and a summary lands in the activity log.
    if (status === "blocked") {
      runReplan("blocked")
        .then(() => {
          toast.success("Re-planned around the blocked step.");
          queryClient.invalidateQueries({ queryKey: ["activity"] });
        })
        .catch((e) => toast.error(`Re-plan failed: ${e instanceof Error ? e.message : String(e)}`));
    }
  }

  return (
    <section className="map-card exec-card" aria-labelledby="exec-step">
      <p className="exec-eyebrow">One next action</p>
      <p className="exec-context">{props.context}</p>
      <h1 id="exec-step" className="exec-step">{props.title}</h1>

      <div className="exec-body">
        <fieldset className="exec-check">
          <legend>Good-enough done</legend>
          {props.criteria.map((c, i) => (
            <label key={i}>
              <input type="checkbox" checked={checked[i]} onChange={() => setChecked((p) => p.map((v, j) => (j === i ? !v : v)))} />
              {c}
            </label>
          ))}
        </fieldset>

        <div className="exec-timer">
          <svg width="180" height="180" viewBox="0 0 180 180" role="img" aria-label={`${fmtClock(left)} left of ${props.timeboxMinutes} minute timebox`}>
            <circle cx="90" cy="90" r={R} fill="none" stroke="var(--border)" strokeWidth="10" />
            <circle cx="90" cy="90" r={R} fill="none" stroke="var(--primary)" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - left / total)} transform="rotate(-90 90 90)" />
            <text x="90" y="98" textAnchor="middle" className="exec-clock">{fmtClock(left)}</text>
          </svg>
          {timeUp ? (
            <p className="exec-timeup" role="status"><AlertTriangle size={16} aria-hidden="true" />Time's up — stop here.</p>
          ) : (
            <button type="button" className="map-btn" onClick={() => setRunning((r) => !r)}>
              {running ? <><Pause size={14} aria-hidden="true" />Pause</> : <><Play size={14} aria-hidden="true" />{elapsed ? "Resume" : "Start timer"}</>}
            </button>
          )}
        </div>
      </div>

      <div className="exec-actions">
        <button type="button" className="exec-btn exec-done" onClick={() => finish("done")}><Check size={16} aria-hidden="true" />Done</button>
        <button type="button" className="exec-btn exec-blocked" onClick={() => finish("blocked")}><Hand size={16} aria-hidden="true" />Blocked</button>
        <button type="button" className="exec-btn exec-stopped" onClick={() => finish("stopped")}><Square size={16} aria-hidden="true" />Stopped at timebox</button>
      </div>

      <p className="exec-why"><strong>Why this now:</strong> {props.why}</p>
    </section>
  );
}

/** Inline one-tap check for a suspiciously long timed step. Dismissing = discard. */
function SuspectCheck(props: { sample: Sample; onAnswer: (a: SuspectAnswer) => void }) {
  const [real, setReal] = useState("");
  const realMinutes = real.trim() ? Number(real) : null;
  return (
    <section className="map-card exec-suspect" role="status" aria-labelledby="suspect-q">
      <p id="suspect-q"><AlertTriangle size={16} aria-hidden="true" /> {suspectPrompt(props.sample)}</p>
      <div className="exec-suspect-row">
        <label>Real time (optional, minutes)
          <input type="number" min={1} value={real} onChange={(e) => setReal(e.target.value)} />
        </label>
        <button type="button" className="map-btn" onClick={() => props.onAnswer({ kind: "kept_running", realMinutes })}>It kept running</button>
        <button type="button" className="map-btn" onClick={() => props.onAnswer({ kind: "accurate" })}>That time is accurate</button>
        <button type="button" className="map-btn" aria-label="Dismiss (discard this timing)" onClick={() => props.onAnswer({ kind: "dismissed" })}>Dismiss</button>
      </div>
    </section>
  );
}
