// Running behind tab. Shows ONE recommended re-plan (picked by
// src/lib/agent/replan.ts); "Adjust" reveals the alternatives. Accept runs the
// re-planner, and "What the system did" reads from activity_log.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listActivity } from "@/lib/db";
import { recommendPlan, runReplan, type PlanItem } from "@/lib/agent/replan";
import { DEFAULT_WEEKLY_HOURS } from "@/lib/agent/buffer";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { loadMapData, BufferChip } from "@/components/map-view";
import { bufferStateFor, computeSlack, daysUntil, remainingMinutes } from "@/lib/engine/buffer";
import type { BufferState } from "@/types/nextstep";

type OptionId = "triage" | "compress" | "partial";

interface ReplanOption {
  id: OptionId;
  title: string;
  summary: string;
  /** Illustrative new buffer state for the at-risk assignment under this option. */
  newState: BufferState;
  /** Illustrative effect on the next assignments in line. */
  othersNewState: BufferState;
}

const OPTIONS: ReplanOption[] = [
  { id: "triage", title: "Triage now", summary: "Pause lower-priority steps today and spend every free block on this assignment until it's submitted.", newState: "amber", othersNewState: "amber" },
  { id: "compress", title: "Compress into one block", summary: "Cut the remaining steps to the essentials and do them in one long focused block tonight.", newState: "amber", othersNewState: "green" },
  { id: "partial", title: "Submit partial", summary: "Submit what's finished by the deadline and keep the rest of your week on track.", newState: "green", othersNewState: "green" },
];

function fmtMinutes(min: number) {
  const h = Math.floor(min / 60);
  return h ? `${h}h ${min % 60}m` : `${min}m`;
}

export function BehindView() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["lms", "map"], queryFn: loadMapData });
  const activity = useQuery({ queryKey: ["activity"], queryFn: () => listActivity(8) });
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<OptionId | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const accept = useMutation({
    mutationFn: (opt: OptionId | undefined) => runReplan("accept", opt),
    onSuccess: () => { toast.success("Re-plan applied."); queryClient.invalidateQueries({ queryKey: ["activity"] }); },
    onError: (e) => toast.error(`Re-plan failed: ${e instanceof Error ? e.message : String(e)}`),
  });

  if (isLoading) return <div className="map-state" role="status"><Loader2 size={22} aria-hidden="true" />Checking your buffers…</div>;
  if (isError || !data) return <div className="map-state" role="alert"><AlertTriangle size={22} aria-hidden="true" />Couldn't load your work.</div>;

  const code = new Map(data.courses.map((c) => [c.lmsCourseId, c.code]));
  const rows = data.assignments
    .map((a) => {
      const days = daysUntil(a.dueAt);
      const remaining = remainingMinutes(a.estimatedMinutes, a.progressPct);
      const slack = computeSlack(days, remaining);
      return { a, days, remaining, slack, state: bufferStateFor(slack) };
    })
    .sort((x, y) => x.slack - y.slack);

  const behind = rows.find((r) => r.state === "red");
  if (!behind) {
    return <div className="map-state"><CheckCircle2 size={22} aria-hidden="true" />You're not behind on anything. Nothing to re-plan.</div>;
  }

  // Ask the re-planner which single option to recommend for this week.
  const items: PlanItem[] = rows.map((r) => ({
    id: r.a.lmsAssignmentId, title: r.a.title, dueAt: r.a.dueAt,
    steps: (r.a.steps ?? []).filter((st) => st.status === "todo")
      .map((st) => ({ id: `${r.a.lmsAssignmentId}:${st.orderIndex}`, title: st.title, minutes: st.timeboxMinutes })),
  }));
  const recommendedId = recommendPlan(items, behind.a.lmsAssignmentId, DEFAULT_WEEKLY_HOURS).recommended.option;
  const selected = picked ?? recommendedId;
  const option = OPTIONS.find((o) => o.id === selected)!;
  const visible = adjusting ? OPTIONS : OPTIONS.filter((o) => o.id === recommendedId);
  const others = rows.filter((r) => r !== behind).slice(0, 3);
  const course = code.get(behind.a.lmsCourseId);
  const hoursLeft = Math.max(0, Math.round((behind.days ?? 0) * 24));

  return (
    <div className="map-view">
      <div className="behind-alert" role="alert">
        <AlertTriangle size={22} aria-hidden="true" />
        <div>
          <h1>{course} buffer exhausted — no room to be behind</h1>
          <p>
            "{behind.a.title}" still needs about {fmtMinutes(behind.remaining)} of work, but it's due in {hoursLeft}h.
            At your usual pace there's no slack left, so even a short delay means missing the deadline.
          </p>
        </div>
      </div>

      <div className="exec-grid">
        <section className="map-card" aria-labelledby="replan-title">
          <h2 id="replan-title">Re-plan proposal</h2>
          <div className="behind-options" role="radiogroup" aria-label="Re-plan options">
            {visible.map((o) => {
              const isSel = o.id === selected;
              return (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={isSel}
                  className={`behind-option${isSel ? " is-selected" : ""}`}
                  onClick={() => setPicked(o.id)}
                >
                  <span className="behind-option-head">
                    <span className="behind-radio" aria-hidden="true">{isSel && <CheckCircle2 size={16} />}</span>
                    {o.title}
                    {o.id === recommendedId && <span className="course-chip">Recommended</span>}
                  </span>
                  <span className="behind-option-body">{o.summary}</span>
                </button>
              );
            })}
          </div>
          <div className="exec-actions" style={{ marginTop: 16 }}>
            <button type="button" className="exec-btn behind-accept" disabled={accept.isPending}
              onClick={() => accept.mutate(selected === recommendedId ? undefined : selected)}>
              {accept.isPending ? "Applying…" : "Accept"}
            </button>
            {!adjusting && (
              <button type="button" className="exec-btn exec-stopped" onClick={() => setAdjusting(true)}>Adjust</button>
            )}
          </div>
        </section>

        <aside className="map-aside">
          <section className="map-card" aria-labelledby="impact-title">
            <h2 id="impact-title">Impact on deadlines</h2>
            <ul className="behind-impact">
              {[{ r: behind, next: option.newState }, ...others.map((r) => ({ r, next: r.state === "green" ? "green" as const : option.othersNewState }))].map(({ r, next }) => (
                <li key={r.a.lmsAssignmentId}>
                  <div><span className="course-chip">{code.get(r.a.lmsCourseId)}</span> <span className="exec-next-title">{r.a.title}</span></div>
                  <div className="behind-chips">
                    <span className="sr-only">Before:</span><BufferChip state={r.state} />
                    <span aria-hidden="true">→</span>
                    <span className="sr-only">After:</span><BufferChip state={next} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section className="map-card" aria-labelledby="did-title">
            <h2 id="did-title">What the system did</h2>
            {activity.isLoading ? <p className="map-meta">Loading…</p>
              : activity.isError ? <p className="map-meta" role="alert">Couldn't load activity.</p>
              : !activity.data?.length ? <p className="map-meta">Nothing yet. Accept a plan or mark a step Blocked.</p>
              : <ul className="map-activity">{activity.data.map((e) => <li key={e.id}>{e.message}</li>)}</ul>}
          </section>
        </aside>
      </div>
    </div>
  );
}
