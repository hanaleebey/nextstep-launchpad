// Map tab: semester overview. Reads LMS data ONLY via getLmsProvider();
// buffer states and the week timeline come from the deterministic engine.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { focusAssignment, useExecuteSession, withOverrides } from "@/lib/session/execute-store";
import type { LmsStep } from "@/lib/lms";
import { AlertTriangle, Ban, Check, CheckCircle2, Circle, ListChecks, Square, X, CircleAlert, Inbox, Loader2, RefreshCw, type LucideIcon } from "lucide-react";
import { getLmsProvider, subscribeLmsDataChanged, syncLmsNow, type Assignment, type Course } from "@/lib/lms";
import { decomposeAllUnplanned } from "@/lib/agent/decompose-persist";
import { BUFFER_LABEL, bufferStateFor, computeSlack, daysUntil, remainingMinutes } from "@/lib/engine/buffer";
import { scheduleWeek, type SchedulableStep } from "@/lib/engine/schedule";
import type { BufferState } from "@/types/nextstep";

interface MapData {
  courses: Course[];
  assignments: Assignment[];
  syncedAt: number;
}

export async function loadMapData(): Promise<MapData> {
  const lms = getLmsProvider();
  const courses = await lms.getCourses();
  const lists = await Promise.all(courses.map((c) => lms.getAssignments(c.lmsCourseId)));
  return { courses, assignments: lists.flat(), syncedAt: Date.now() };
}

const BUFFER_ICON: Record<BufferState, LucideIcon> = { green: CheckCircle2, amber: CircleAlert, red: AlertTriangle };

export function BufferChip({ state }: { state: BufferState }) {
  const Icon = BUFFER_ICON[state];
  return (
    <span className={`buffer-chip buffer-${state}`}>
      <Icon size={14} aria-hidden="true" />
      {BUFFER_LABEL[state]}
    </span>
  );
}

function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function dueLine(dueAt: string | null, days: number | null): string {
  if (!dueAt || days === null) return "No due date";
  const date = new Date(dueAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  if (days < 0) return `Due ${date} · overdue`;
  if (days < 1) return `Due ${date} · today (${Math.max(1, Math.round(days * 24))}h left)`;
  const d = Math.round(days);
  return `Due ${date} · ${d} day${d === 1 ? "" : "s"} left`;
}

function syncedAgo(ts: number): string {
  const h = Math.floor((Date.now() - ts) / 3_600_000);
  return h < 1 ? "synced just now" : `synced ${h}h ago`;
}

export function MapView({ onOpen }: { onOpen: () => void }) {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["lms", "map"], queryFn: loadMapData });
  const session = useExecuteSession();
  const [openId, setOpenId] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const qc = useQueryClient();

  // Background Moodle syncs finish after first paint; refetch when they do.
  useEffect(() => subscribeLmsDataChanged(() => { void qc.invalidateQueries({ queryKey: ["lms"] }); }), [qc]);

  async function planUnplanned(ids?: string[]) {
    setPlanning(true);
    try {
      const types = Object.fromEntries((data?.assignments ?? []).map((a) => [a.lmsAssignmentId, a.itemType]));
      const r = await decomposeAllUnplanned(types, ids);
      await qc.invalidateQueries();
      toast.success(r.assignments ? `Planned ${r.assignments} assignment(s) into ${r.steps} steps.` : "Every assignment already has steps.");
    } catch (e) {
      toast.error(`Couldn't plan steps: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setPlanning(false); }
  }

  async function syncNow() {
    setSyncing(true);
    try {
      const live = await syncLmsNow();
      await qc.invalidateQueries();
      toast.success(live ? "Synced with Moodle." : "Demo data is showing — nothing to sync.");
    } catch {
      toast.error("Moodle sync could not finish. Your saved work is unchanged.");
    } finally { setSyncing(false); }
  }

  if (isLoading) {
    return (
      <div className="map-state" role="status">
        <Loader2 className="map-spin" size={22} aria-hidden="true" />
        Loading your semester…
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="map-state" role="alert">
        <AlertTriangle size={22} aria-hidden="true" />
        Couldn't load your courses.
        <button type="button" className="map-btn" onClick={() => refetch()}><RefreshCw size={14} aria-hidden="true" />Try again</button>
      </div>
    );
  }
  if (data.assignments.length === 0) {
    return (
      <div className="map-state">
        <Inbox size={22} aria-hidden="true" />
        No assignments yet. Connect your LMS to see your semester here.
      </div>
    );
  }

  const courseCode = new Map(data.courses.map((c) => [c.lmsCourseId, c.code]));

  // Derive per-row values once (with this session's step updates applied),
  // then sort by urgency (least slack first).
  const rows = data.assignments
    .map((a) => {
      const steps = withOverrides(a.lmsAssignmentId, a.steps ?? [], session.overrides);
      const doneSteps = steps.filter((s) => s.status !== "todo").length;
      const progress = steps.length ? Math.round((doneSteps / steps.length) * 100) : a.progressPct;
      const days = daysUntil(a.dueAt);
      const remaining = remainingMinutes(a.estimatedMinutes, progress);
      const slack = computeSlack(days, remaining);
      return {
        a, days, remaining, slack, steps, progress, doneSteps,
        state: bufferStateFor(slack),
        totalSteps: steps.length,
      };
    })
    .sort((x, y) => x.slack - y.slack);
  const openRow = rows.find((r) => r.a.lmsAssignmentId === openId) ?? null;

  const upcoming = rows.filter((r) => r.days !== null && r.days >= 0);
  const atRisk = rows.filter((r) => r.state !== "green").length;
  const totalRemaining = rows.reduce((s, r) => s + r.remaining, 0);
  const thisWeek = rows.filter((r) => r.days !== null && r.days >= 0 && r.days <= 7).length;
  const unplannedCount = rows.filter((r) => r.totalSteps === 0).length;

  // Week timeline: feed unfinished steps in urgency order to the scheduler.
  const queue: SchedulableStep[] = rows.flatMap((r) =>
    r.steps
      .filter((s) => s.status === "todo")
      .map((s) => ({
        assignmentId: r.a.lmsAssignmentId,
        courseCode: courseCode.get(r.a.lmsCourseId) ?? "",
        title: s.title,
        minutes: s.timeboxMinutes,
        dueAt: r.a.dueAt,
      })),
  );
  const blocks = scheduleWeek(queue);
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return { i, label: i === 0 ? "Today" : d.toLocaleDateString(undefined, { weekday: "short" }), date: d.getDate() };
  });

  // Automated activity: what the system did during this sync.
  const red = rows.filter((r) => r.state === "red");
  const activity = [
    `Synced ${data.courses.length} courses and ${data.assignments.length} assignments`,
    `Estimated remaining work: ${formatMinutes(totalRemaining)}`,
    `Scheduled ${blocks.length} timeboxed blocks across the next 7 days`,
    ...red.map((r) => `Flagged "${r.a.title}" — no room to be behind`),
  ];

  return (
    <div className="map-view">
      <header className="map-header">
        <div>
          <h1>Fall 2026</h1>
          <p className="map-sub">
            {data.courses.length} active courses · {upcoming.length} upcoming deadlines · {syncedAgo(data.syncedAt)}
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <button type="button" className="map-btn" onClick={syncNow} disabled={syncing}>
            {syncing ? <Loader2 size={14} className="map-spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
            {syncing ? "Syncing…" : "Sync with Moodle"}
          </button>
          {unplannedCount > 0 && (
            <button type="button" className="map-btn" onClick={() => planUnplanned()} disabled={planning}>
              {planning ? <Loader2 size={14} className="map-spin" aria-hidden="true" /> : <ListChecks size={14} aria-hidden="true" />}
              {planning ? "Planning…" : `Plan all unplanned (${unplannedCount})`}
            </button>
          )}
          <ul className="map-legend" aria-label="Buffer legend">
            {(["green", "amber", "red"] as const).map((s) => <li key={s}><BufferChip state={s} /></li>)}
          </ul>
        </div>
      </header>

      <section className="map-stats" aria-label="Summary">
        <Stat label="Assignments" value={String(rows.length)} />
        <Stat label="At risk" value={String(atRisk)} />
        <Stat label="Estimated load (remaining)" value={formatMinutes(totalRemaining)} />
        <Stat label="This week" value={String(thisWeek)} />
      </section>

      <div className="map-grid">
        <section aria-labelledby="map-list-title" className="map-card">
          <h2 id="map-list-title">Assignments by urgency</h2>
          <ul className="map-list">
            {rows.map((r) => {
              const started = r.doneSteps > 0;
              return (
                <li key={r.a.lmsAssignmentId} className={`map-row${r.state === "red" ? " map-row-red" : ""}`}>
                  <div className="map-row-main">
                    <span className="course-chip">{courseCode.get(r.a.lmsCourseId)}</span>
                    <h3>{r.a.title}</h3>
                    <p className="map-due">{dueLine(r.a.dueAt, r.days)}</p>
                    <div className="map-progress" role="progressbar" aria-valuenow={r.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${r.a.title} progress`}>
                      <span style={{ width: `${r.progress}%` }} />
                    </div>
                    <p className="map-meta">
                      {r.totalSteps ? `${r.doneSteps} of ${r.totalSteps} steps · ${r.progress}%` : "No steps planned yet"} · est. {formatMinutes(r.remaining)} left
                    </p>
                  </div>
                  <div className="map-row-side">
                    <BufferChip state={r.state} />
                    <button type="button" className="map-btn" aria-expanded={openId === r.a.lmsAssignmentId} onClick={() => setOpenId(openId === r.a.lmsAssignmentId ? null : r.a.lmsAssignmentId)}>{openId === r.a.lmsAssignmentId ? "Close" : started ? "Resume" : "Open"}</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="map-aside">
          {openRow && (
            <AssignmentDetail
              row={openRow}
              courseCode={courseCode.get(openRow.a.lmsCourseId) ?? ""}
              onClose={() => setOpenId(null)}
              onWork={() => { focusAssignment(openRow.a.lmsAssignmentId); onOpen(); }}
            />
          )}
          <section aria-labelledby="map-week-title" className="map-card">
            <h2 id="map-week-title">This week</h2>
            {blocks.length === 0 ? (
              <p className="map-empty">Nothing scheduled in the next 7 days.</p>
            ) : (
              <ol className="map-week">
                {days.map((d) => {
                  const dayBlocks = blocks.filter((b) => b.dayIndex === d.i);
                  return (
                    <li key={d.i}>
                      <div className="map-day"><strong>{d.label}</strong> <span>{d.date}</span></div>
                      {dayBlocks.length === 0 ? (
                        <p className="map-empty">Free</p>
                      ) : (
                        <ul>
                          {dayBlocks.map((b, k) => (
                            <li key={k} className="map-block">
                              <span className="course-chip">{b.courseCode}</span>
                              <span className="map-block-title">{b.title}</span>
                              <span className="map-block-min">{b.minutes}m</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section aria-labelledby="map-activity-title" className="map-card">
            <h2 id="map-activity-title">Automated activity</h2>
            <ul className="map-activity">
              {activity.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="map-stat">
      <span className="map-stat-label">{label}</span>
      <span className="map-stat-value">{value}</span>
    </div>
  );
}

const STEP_STATUS: Record<LmsStep["status"], { label: string; Icon: LucideIcon }> = {
  todo: { label: "To do", Icon: Circle },
  done: { label: "Done", Icon: Check },
  blocked: { label: "Blocked", Icon: Ban },
  stopped: { label: "Stopped at timebox", Icon: Square },
};

/** "Open" panel: the full step breakdown and done criteria for one assignment. */
function AssignmentDetail(props: {
  row: { a: Assignment; steps: LmsStep[]; progress: number; days: number | null; remaining: number; state: BufferState };
  courseCode: string;
  onClose: () => void;
  onWork: () => void;
}) {
  const { a, steps, progress, days, remaining, state } = props.row;
  const hasTodo = steps.some((s) => s.status === "todo");
  return (
    <section className="map-card map-detail" aria-labelledby="map-detail-title">
      <div className="map-detail-head">
        <span className="course-chip">{props.courseCode}</span>
        <button type="button" className="map-icon-btn" aria-label="Close assignment details" onClick={props.onClose}><X size={16} aria-hidden="true" /></button>
      </div>
      <h2 id="map-detail-title">{a.title}</h2>
      <p className="map-due">{dueLine(a.dueAt, days)}</p>
      <BufferChip state={state} />
      <div className="map-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Assignment progress"><span style={{ width: `${progress}%` }} /></div>
      <p className="map-meta">{progress}% done · est. {formatMinutes(remaining)} left</p>
      {steps.length === 0 ? (
        <p className="map-empty">No steps planned yet. Generate steps from the Connect tab.</p>
      ) : (
        <ol className="map-steps">
          {[...steps].sort((x, y) => x.orderIndex - y.orderIndex).map((s) => {
            const { label, Icon } = STEP_STATUS[s.status];
            return (
              <li key={s.orderIndex} className={`map-step map-step-${s.status}`}>
                <div className="map-step-head">
                  <span className="map-step-num">{s.orderIndex + 1}</span>
                  <span className="map-step-title">{s.title}</span>
                  <span className="map-block-min">{s.timeboxMinutes}m</span>
                </div>
                <span className="map-step-status"><Icon size={13} aria-hidden="true" />{label}</span>
                {s.doneCriteria.length > 0 && (
                  <details>
                    <summary>Good-enough done ({s.doneCriteria.length})</summary>
                    <ul>{s.doneCriteria.map((c, i) => <li key={i}>{c}</li>)}</ul>
                  </details>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {hasTodo && <button type="button" className="exec-btn exec-done" onClick={props.onWork}>Work on this in Execute</button>}
    </section>
  );
}
