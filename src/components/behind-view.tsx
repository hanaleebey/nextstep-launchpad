// Running behind tab. UI only for now: the re-plan options and their
// "impact on deadlines" are illustrative, not computed. Selecting/accepting
// an option is local UI state — no data is changed yet.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  const [selected, setSelected] = useState<OptionId>("triage");
  const [decision, setDecision] = useState<"accepted" | "adjust" | null>(null);

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

  const option = OPTIONS.find((o) => o.id === selected)!;
  const others = rows.filter((r) => r !== behind).slice(0, 3);
  const course = code.get(behind.a.lmsCourseId);
  const hoursLeft = Math.max(0, Math.round((behind.days ?? 0) * 24));

  const feed = [
    `Detected that "${behind.a.title}" has no buffer left`,
    `Compared ${fmtMinutes(behind.remaining)} of remaining work with ${hoursLeft}h until the deadline`,
    `Prepared ${OPTIONS.length} re-plan options and recommended "${OPTIONS[0].title}"`,
    "Held off changing your schedule until you choose",
  ];

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
            {OPTIONS.map((o, i) => {
              const isSel = o.id === selected;
              return (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={isSel}
                  className={`behind-option${isSel ? " is-selected" : ""}`}
                  onClick={() => { setSelected(o.id); setDecision(null); }}
                >
                  <span className="behind-option-head">
                    <span className="behind-radio" aria-hidden="true">{isSel && <CheckCircle2 size={16} />}</span>
                    {o.title}
                    {i === 0 && <span className="course-chip">Recommended</span>}
                  </span>
                  <span className="behind-option-body">{o.summary}</span>
                </button>
              );
            })}
          </div>
          <div className="exec-actions" style={{ marginTop: 16 }}>
            <button type="button" className="exec-btn behind-accept" onClick={() => setDecision("accepted")}>Accept</button>
            <button type="button" className="exec-btn exec-stopped" onClick={() => setDecision("adjust")}>Adjust</button>
          </div>
          {decision && (
            <p className="map-meta" role="status" style={{ marginTop: 10 }}>
              {decision === "accepted"
                ? `"${option.title}" selected. Applying re-plans isn't built yet, so nothing has changed.`
                : "Adjusting a plan isn't built yet."}
            </p>
          )}
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
            <ul className="map-activity">{feed.map((m, i) => <li key={i}>{m}</li>)}</ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
