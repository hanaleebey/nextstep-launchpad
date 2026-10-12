// Settings page. Gathers inputs (users_settings) and displays engine outputs.
// No planning logic lives here: allocation is done by src/lib/agent.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarX2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ensureDefaultSettings, getSettings, listAssignments, listCourses, listWeeklyAllocations, saveSettings } from "@/lib/db";
import { recomputeWeeklyAllocations } from "@/lib/agent/allocate-persist";
import { isDueInHorizon } from "@/lib/agent/allocate";
import { weekInTimezone } from "@/lib/time/week-in-timezone";
import type { AllocationResult } from "@/lib/agent/allocate";

/** Load the row; create it with column defaults if missing. */
async function loadSettings() {
  const existing = await getSettings();
  if (existing) return existing;
  await ensureDefaultSettings();
  return getSettings();
}

// Fixed list of standard-timezone options. Labels show standard-time offsets
// (not DST); the stored IANA id handles DST automatically.
const TIMEZONES: { label: string; id: string }[] = [
  { label: "(UTC-10) Hawaii-Aleutian", id: "Pacific/Honolulu" },
  { label: "(UTC-9) Alaska", id: "America/Anchorage" },
  { label: "(UTC-8) Pacific Time", id: "America/Los_Angeles" },
  { label: "(UTC-7) Mountain Time", id: "America/Denver" },
  { label: "(UTC-7) Arizona (no DST)", id: "America/Phoenix" },
  { label: "(UTC-6) Central Time", id: "America/Chicago" },
  { label: "(UTC-5) Eastern Time", id: "America/New_York" },
  { label: "(UTC+0) UTC", id: "UTC" },
  { label: "(UTC+0) London / GMT", id: "Europe/London" },
  { label: "(UTC+1) Central European Time", id: "Europe/Paris" },
  { label: "(UTC+5:30) India Standard Time", id: "Asia/Kolkata" },
  { label: "(UTC+8) China / Singapore", id: "Asia/Shanghai" },
  { label: "(UTC+9) Japan Standard Time", id: "Asia/Tokyo" },
  { label: "(UTC+10) Australia Eastern Time", id: "Australia/Sydney" },
];

/** Browser's zone if it's in the list, otherwise Eastern Time. */
function defaultTimezone(): string {
  const browser = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return TIMEZONES.some((t) => t.id === browser) ? browser : "America/New_York";
}

export function SettingsView() {
  const queryClient = useQueryClient();
  const settingsQ = useQuery({ queryKey: ["settings"], queryFn: loadSettings });

  const [hours, setHours] = useState("20");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("21:00");
  const [tz, setTz] = useState("UTC");
  const [saving, setSaving] = useState(false);
  const tzList = useMemo(timezones, []);

  useEffect(() => {
    const s = settingsQ.data;
    if (!s) return;
    setHours(String(s.weekly_available_hours));
    setStart(s.study_window_start.slice(0, 5));
    setEnd(s.study_window_end.slice(0, 5));
    setTz(s.timezone);
  }, [settingsQ.data]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    const h = Number(hours);
    if (!Number.isFinite(h) || h < 0 || h > 80) {
      toast.error("Weekly hours must be between 0 and 80.");
      return;
    }
    setSaving(true);
    try {
      await saveSettings({ weekly_available_hours: h, study_window_start: start, study_window_end: end, timezone: tz });
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="map-view">
      <header className="map-header"><div><h1>Settings</h1><p className="map-sub">Your weekly capacity drives every plan NextStep makes.</p></div></header>

      <section className="map-card" aria-labelledby="capacity-title">
        <h2 id="capacity-title">Weekly capacity</h2>
        {settingsQ.isLoading ? (
          <p className="map-empty" role="status">Loading your settings…</p>
        ) : settingsQ.isError ? (
          <p className="map-empty" role="alert">Couldn't load your settings.</p>
        ) : (
          <form onSubmit={onSave} className="settings-form">
            <label>Weekly available hours
              <input type="number" step={0.5} min={0} max={80} required value={hours} onChange={(e) => setHours(e.target.value)} />
            </label>
            <label>Study window start
              <input type="time" required value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label>Study window end
              <input type="time" required value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
            <label>Timezone
              <select value={tz} onChange={(e) => setTz(e.target.value)}>
                {tzList.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            </label>
            <div><button type="submit" className="exec-btn behind-accept" disabled={saving}>{saving ? "Saving…" : "Save"}</button></div>
          </form>
        )}
      </section>

      <AllocationPanel timezone={settingsQ.data?.timezone ?? "UTC"} />
    </div>
  );
}

/** Re-read this week's open assignments, their courses and allocation rows. */
async function loadWeek(timezone: string) {
  const horizon = weekInTimezone(new Date(), timezone);
  const weekStart = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(horizon.start);
  const [assignments, courses, allocations] = await Promise.all([listAssignments(), listCourses(), listWeeklyAllocations(weekStart)]);
  const courseName = new Map(courses.map((c) => [c.id, c.code ?? c.name]));
  const allocated = new Map(allocations.map((a) => [a.assignment_id, a.allocated_minutes]));
  const rows = assignments
    .filter((a) => a.status !== "done" && isDueInHorizon(a.due_at, horizon.start, horizon.end))
    .map((a) => ({ a, course: a.course_id ? courseName.get(a.course_id) ?? "—" : "—", allocated: allocated.get(a.id) ?? null }));
  return { horizon, rows };
}

function AllocationPanel({ timezone }: { timezone: string }) {
  const queryClient = useQueryClient();
  const weekQ = useQuery({ queryKey: ["week-allocation", timezone], queryFn: () => loadWeek(timezone) });
  const [result, setResult] = useState<AllocationResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function recompute() {
    setBusy(true);
    try {
      const r = await recomputeWeeklyAllocations(new Date(), weekInTimezone(new Date(), timezone));
      setResult(r);
      await queryClient.invalidateQueries({ queryKey: ["week-allocation"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't recompute");
    } finally {
      setBusy(false);
    }
  }

  async function seed() {
    const { loadDemoWeek } = await import("@/lib/dev/demo-seed");
    try {
      const n = await loadDemoWeek();
      toast.success(n ? `Added ${n} demo assignments` : "Demo week already loaded");
      await queryClient.invalidateQueries({ queryKey: ["week-allocation"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load demo week");
    }
  }

  const allocatedTotal = result ? result.allocations.reduce((s, a) => s + a.minutes, 0) : 0;
  const fmtDue = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(undefined, { timeZone: timezone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

  return (
    <section className="map-card" aria-labelledby="alloc-title">
      <div className="settings-panel-head">
        <h2 id="alloc-title">This week's allocation</h2>
        <div className="exec-actions">
          {import.meta.env.DEV && <button type="button" className="exec-btn exec-stopped" onClick={seed}>Load demo week</button>}
          <button type="button" className="exec-btn behind-accept" onClick={recompute} disabled={busy}>
            {busy ? <Loader2 size={16} aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}Recompute this week
          </button>
        </div>
      </div>

      {result?.overCapacity && (
        <div className="behind-alert" role="alert" style={{ marginBottom: 12 }}>
          <AlertTriangle size={20} aria-hidden="true" />
          <div>
            <h1>Over capacity — this week doesn't fit</h1>
            <p>{result.signalLoad} min of fixed work vs {result.capacity} min available ({result.signalLoad - result.capacity} min over).</p>
          </div>
        </div>
      )}

      {result && (
        <p className="map-meta" role="status" style={{ marginBottom: 12 }}>
          Weekly capacity {result.capacity} min · fixed {result.signalLoad} min (signal + manual) · allocated {allocatedTotal} min · free left {Math.max(0, result.free - allocatedTotal)} min
        </p>
      )}

      {weekQ.isLoading ? (
        <p className="map-empty" role="status">Loading this week…</p>
      ) : weekQ.isError || !weekQ.data ? (
        <p className="map-empty" role="alert">Couldn't load this week.</p>
      ) : weekQ.data.rows.length === 0 ? (
        <div className="map-state"><CalendarX2 size={22} aria-hidden="true" />Nothing is due this week.</div>
      ) : (
        <div className="settings-table-wrap">
          <table className="settings-table">
            <thead><tr><th>Title</th><th>Course</th><th>Due</th><th>Estimate source</th><th>Allocated</th></tr></thead>
            <tbody>
              {weekQ.data.rows.map(({ a, course, allocated }) => (
                <tr key={a.id}>
                  <td>{a.title}</td>
                  <td>{course}</td>
                  <td>{fmtDue(a.due_at)}</td>
                  <td>{a.estimate_source ?? "—"}</td>
                  <td className="tabular-nums">{allocated === null ? "—" : `${allocated} min`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
