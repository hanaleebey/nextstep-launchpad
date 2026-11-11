// Settings page. Grouped cards over users_settings, calibration_multipliers and
// lms_connections. No planning logic lives here: allocation/buffer/estimation
// engines keep running unchanged in src/lib/agent.
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  ensureDefaultSettings, getLmsConnection, getSettings, listCalibrationMultipliers,
  removeLmsConnection, resetAllAppData, resetCalibration, saveSettings,
} from "@/lib/db";
import { resetLmsProvider, syncLmsNow } from "@/lib/lms";
import { getProviderState, setUseDemoData } from "@/lib/lms/provider-state";
import { Switch } from "@/components/ui/switch";
import type { UserSettings } from "@/types/nextstep";

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

const TIMEBOX_OPTIONS = [10, 15, 25, 45];

/** Browser's zone if it's in the list, otherwise Eastern Time. */
function defaultTimezone(): string {
  const browser = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return TIMEZONES.some((t) => t.id === browser) ? browser : "America/New_York";
}

/** Weekly hours must be a whole 1–60. Exported for tests. */
export function validWeeklyHours(h: number): boolean {
  return Number.isInteger(h) && h >= 1 && h <= 60;
}

/** The danger-zone reset only arms when the student types RESET exactly. */
export function canResetData(typed: string): boolean {
  return typed === "RESET";
}

export function SettingsView({ email }: { email: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const settingsQ = useQuery({ queryKey: ["settings"], queryFn: loadSettings });

  return (
    <div className="map-view">
      <header className="map-header">
        <div>
          <h1>Settings</h1>
          <p className="map-sub">Your weekly capacity drives every plan NextStep makes.</p>
        </div>
      </header>

      <div className="settings-grid">
        <AccountCard email={email} onSignOut={async () => {
          await queryClient.cancelQueries();
          queryClient.clear();
          await supabase.auth.signOut();
          resetLmsProvider();
          navigate({ to: "/auth", replace: true });
        }} />
        <CapacityCard settingsQ={settingsQ} />
        <PlanningCard settingsQ={settingsQ} />
        <CalibrationCard />
        <ConnectionCard />
      </div>
    </div>
  );
}

type SettingsQuery = ReturnType<typeof useQuery<UserSettings | null>>;

/** Save a patch with an optimistic cache update and a toast on the result. */
function useSaveSettings(queryClient: ReturnType<typeof useQueryClient>) {
  const [saving, setSaving] = useState(false);
  async function save(patch: Partial<Pick<UserSettings, "weekly_available_hours" | "timezone" | "default_timebox_minutes" | "auto_plan_new_items">>) {
    setSaving(true);
    const prev = queryClient.getQueryData<UserSettings | null>(["settings"]);
    if (prev) queryClient.setQueryData(["settings"], { ...prev, ...patch });
    try {
      await saveSettings(patch);
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Settings saved");
    } catch (err) {
      if (prev) queryClient.setQueryData(["settings"], prev); // roll back
      toast.error(err instanceof Error ? err.message : "Couldn't save settings");
    } finally {
      setSaving(false);
    }
  }
  return { save, saving };
}

// ---------- A. Account ----------
function AccountCard({ email, onSignOut }: { email: string; onSignOut: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <section className="map-card" aria-labelledby="account-title">
      <h2 id="account-title">Account</h2>
      <div className="settings-form">
        <label>Signed in as
          <input type="text" value={email} readOnly aria-readonly="true" />
        </label>
      </div>
      <div style={{ marginTop: 12 }}>
        <button type="button" className="exec-btn exec-stopped" disabled={busy}
          onClick={async () => { setBusy(true); try { await onSignOut(); } finally { setBusy(false); } }}>
          {busy ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </section>
  );
}

// ---------- B. Study capacity ----------
function CapacityCard({ settingsQ }: { settingsQ: SettingsQuery }) {
  const queryClient = useQueryClient();
  const { save, saving } = useSaveSettings(queryClient);
  const [hours, setHours] = useState("20");
  const [tz, setTz] = useState(defaultTimezone);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const s = settingsQ.data;
    if (!s) return;
    setHours(String(s.weekly_available_hours));
    setTz(s.timezone);
  }, [settingsQ.data]);

  // Debounced save-on-change: wait for the student to stop editing.
  function scheduleSave(patch: Parameters<typeof save>[0]) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(patch), 600);
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function onHours(value: string) {
    setHours(value);
    const h = Number(value);
    if (!validWeeklyHours(h)) return; // invalid input just isn't saved yet
    scheduleSave({ weekly_available_hours: h });
  }
  function onTimezone(id: string) {
    setTz(id);
    scheduleSave({ timezone: id });
  }

  return (
    <section className="map-card" aria-labelledby="capacity-title">
      <h2 id="capacity-title">Study capacity</h2>
      {settingsQ.isLoading ? (
        <p className="map-empty" role="status">Loading your settings…</p>
      ) : settingsQ.isError ? (
        <p className="map-empty" role="alert">Couldn't load your settings.</p>
      ) : (
        <>
          <div className="settings-form">
            <label>Weekly available hours
              <input type="number" step={1} min={1} max={60} required value={hours}
                onChange={(e) => onHours(e.target.value)} aria-describedby="capacity-help" />
            </label>
            <label>Timezone
              <select value={tz} onChange={(e) => onTimezone(e.target.value)}>
                {TIMEZONES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
          </div>
          <p className="map-sub" id="capacity-help" style={{ marginTop: 8 }}>
            Used to allocate open-ended work and compute buffers.{saving ? " Saving…" : ""}
          </p>
        </>
      )}
    </section>
  );
}

// ---------- C. Planning preferences ----------
function PlanningCard({ settingsQ }: { settingsQ: SettingsQuery }) {
  const queryClient = useQueryClient();
  const { save, saving } = useSaveSettings(queryClient);
  const s = settingsQ.data;

  return (
    <section className="map-card" aria-labelledby="planning-title">
      <h2 id="planning-title">Planning preferences</h2>
      {settingsQ.isLoading ? (
        <p className="map-empty" role="status">Loading your settings…</p>
      ) : settingsQ.isError || !s ? (
        <p className="map-empty" role="alert">Couldn't load your settings.</p>
      ) : (
        <div className="settings-form" style={{ gridTemplateColumns: "1fr" }}>
          <label>Default step length
            <select value={s.default_timebox_minutes} aria-describedby="timebox-help"
              onChange={(e) => void save({ default_timebox_minutes: Number(e.target.value) })}>
              {TIMEBOX_OPTIONS.map((m) => <option key={m} value={m}>{m} minutes</option>)}
            </select>
          </label>
          <p className="map-sub" id="timebox-help" style={{ marginTop: -8 }}>Used when a step has no timebox.</p>
          <label className="demo-data-control" htmlFor="auto-plan">
            <Switch id="auto-plan" checked={s.auto_plan_new_items} disabled={saving}
              onCheckedChange={(on) => void save({ auto_plan_new_items: on })} />
            Plan new assignments automatically after sync
          </label>
        </div>
      )}
    </section>
  );
}

// ---------- D. Calibration ----------
function CalibrationCard() {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["calibration-rows"], queryFn: listCalibrationMultipliers });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function doReset() {
    setBusy(true);
    try {
      await resetCalibration();
      await queryClient.invalidateQueries({ queryKey: ["calibration-rows"] });
      await queryClient.invalidateQueries({ queryKey: ["calibration"] });
      toast.success("Calibration reset — it will relearn from new timed steps.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't reset calibration");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <section className="map-card" aria-labelledby="calib-title">
      <h2 id="calib-title">Calibration</h2>
      <p className="map-sub">Learned from timed steps. Above ×1.00 means you take longer than the default estimate.</p>
      {q.isLoading ? (
        <p className="map-empty" role="status">Loading…</p>
      ) : q.isError ? (
        <p className="map-empty" role="alert">Couldn't load calibration.</p>
      ) : q.data!.length === 0 ? (
        <p className="map-empty">No calibration yet — it builds as you use the timer.</p>
      ) : (
        <ul className="calib-list">
          {q.data!.map((r) => (
            <li key={r.item_type}>
              <span>{r.item_type} ×{Number(r.multiplier).toFixed(2)}</span>
              <span className="map-sub">{r.sample_count} samples</span>
            </li>
          ))}
        </ul>
      )}
      {q.data && q.data.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {confirming ? (
            <div className="exec-actions">
              <button type="button" className="exec-btn behind-accept" onClick={doReset} disabled={busy}>
                {busy ? "Resetting…" : "Confirm reset"}
              </button>
              <button type="button" className="exec-btn exec-stopped" onClick={() => setConfirming(false)} disabled={busy}>
                Keep calibration
              </button>
            </div>
          ) : (
            <button type="button" className="exec-btn exec-stopped" onClick={() => setConfirming(true)}>
              Reset calibration
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// ---------- E. Connection and data ----------
function ConnectionCard() {
  const queryClient = useQueryClient();
  const connectionQ = useQuery({ queryKey: ["lms-connection"], queryFn: getLmsConnection });
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetTyped, setResetTyped] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const demo = getProviderState().demo;

  const connection = connectionQ.data ?? null;

  async function syncNow() {
    setSyncing(true);
    try {
      const live = await syncLmsNow();
      await queryClient.invalidateQueries();
      toast.success(live ? "Synced with Moodle." : "Demo data is showing — nothing to sync.");
    } catch {
      toast.error("Moodle sync could not finish. Your saved work is unchanged.");
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    if (!connection) return;
    setBusy(true);
    try {
      await removeLmsConnection(connection.id);
      resetLmsProvider();
      await queryClient.invalidateQueries();
      toast.success("Disconnected from Moodle. Your saved work is kept.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't disconnect");
    } finally {
      setBusy(false);
    }
  }

  function toggleDemo(on: boolean) {
    setUseDemoData(on);
    void queryClient.resetQueries({ queryKey: ["lms"] });
    void queryClient.invalidateQueries();
  }

  async function doResetAll() {
    if (!canResetData(resetTyped)) return;
    setResetting(true);
    try {
      await resetAllAppData();
      resetLmsProvider();
      await queryClient.invalidateQueries();
      setResetDone(true);
      setResetTyped("");
      toast.success("Data cleared — press Sync now to rebuild from Moodle.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't clear data");
    } finally {
      setResetting(false);
    }
  }

  return (
    <section className="map-card" aria-labelledby="connection-title">
      <h2 id="connection-title">Connection and data</h2>

      {connectionQ.isLoading ? (
        <p className="map-empty" role="status">Loading connection…</p>
      ) : connection ? (
        <div className="settings-form" style={{ gridTemplateColumns: "1fr" }}>
          <label>Moodle site
            <input type="text" value={connection.site_url ?? "—"} readOnly aria-readonly="true" />
          </label>
          <p className="map-sub" style={{ marginTop: -8 }}>
            Connected {new Date(connection.connected_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
          </p>
          <div className="exec-actions">
            <button type="button" className="exec-btn behind-accept" onClick={syncNow} disabled={syncing}>
              {syncing ? <Loader2 size={16} aria-hidden="true" className="map-spin" /> : <RefreshCw size={16} aria-hidden="true" />}
              {syncing ? "Syncing…" : "Sync now"}
            </button>
            <button type="button" className="exec-btn exec-stopped" onClick={disconnect} disabled={busy}>
              <Unplug size={16} aria-hidden="true" />{busy ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        </div>
      ) : (
        <p className="map-empty">No Moodle connection yet — use the Connect tab to add one.</p>
      )}

      <label className="demo-data-control" htmlFor="settings-use-demo-data" style={{ marginTop: 12 }}>
        <Switch id="settings-use-demo-data" checked={demo} onCheckedChange={toggleDemo} />
        Use demo data
      </label>

      <div className="settings-danger" role="group" aria-labelledby="danger-title">
        <h3 id="danger-title">Danger zone</h3>
        {resetDone ? (
          <p className="map-sub" role="status">Data cleared — press Sync now to rebuild from Moodle.</p>
        ) : (
          <>
            <p className="map-sub">
              Deletes your courses, assignments, steps, estimates, detections, allocations, activity and calibration.
              Your settings and Moodle connection are kept, and you stay signed in.
            </p>
            <label>Type RESET to enable
              <input type="text" value={resetTyped} onChange={(e) => setResetTyped(e.target.value)}
                placeholder="RESET" autoComplete="off" aria-describedby="danger-title" />
            </label>
            <button type="button" className="exec-btn exec-danger" onClick={doResetAll}
              disabled={!canResetData(resetTyped) || resetting}>
              {resetting ? "Clearing…" : "Reset all app data"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
