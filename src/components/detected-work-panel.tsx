import { useState } from "react";
import { AlertTriangle, Check, CheckCircle2, CircleAlert, Loader2, Pencil, ScanSearch, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DetectedItem } from "@/types/nextstep";
import type { ConnectPlanSummary } from "@/lib/agent/connect-plan";

export function DetectedWorkPanel({
  items,
  summary,
  busy,
  saving,
  error,
  warnings,
  ready,
  timezone,
  onRetry,
  onEdit,
}: {
  items: DetectedItem[];
  summary: ConnectPlanSummary | null;
  busy: boolean;
  saving: boolean;
  error: string | null;
  warnings: string[];
  ready: boolean;
  timezone: string;
  onRetry: () => void;
  onEdit: (item: DetectedItem, minutes: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [minutes, setMinutes] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const total = items.reduce((sum, item) => sum + (item.estimated_minutes ?? 0), 0);
  async function save(item: DetectedItem) {
    try {
      setEditError(null);
      await onEdit(item, Number(minutes));
      setEditing(null);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Could not save that estimate.");
    }
  }
  return (
    <section className="connect-card connect-detect" aria-labelledby="auto-detect-title" aria-busy={busy || saving}>
      <div className="connect-card-heading">
        <ScanSearch size={20} aria-hidden="true" />
        <h2 id="auto-detect-title">Auto-detect this week</h2>
      </div>
      <p className="connect-success detect-sublabel">
        <CheckCircle2 size={14} aria-hidden="true" />0 manual entries
      </p>
      {busy && (
        <p role="status" className="connect-feedback">
          <Loader2 className="animate-spin motion-reduce:animate-none" size={17} />
          Detecting work and planning your next steps…
        </p>
      )}
      {error && (
        <div role="alert" className="detect-error">
          <p>
            <AlertTriangle size={16} aria-hidden="true" />
            {error}
          </p>
          <Button variant="outline" onClick={onRetry} disabled={busy || saving}>
            Try again
          </Button>
        </div>
      )}
      {warnings.length > 0 && (
        <p className="detect-warning" role="status">
          <AlertTriangle size={16} aria-hidden="true" />
          Some courses could not be refreshed. Previously saved work has been kept.
        </p>
      )}
      {!ready && !busy && !error && <p className="connect-detect-placeholder">Waiting for your Moodle connection.</p>}
      {ready && items.length === 0 && <p className="detect-empty">No work due this week was found.</p>}
      <ul className="detected-list">
        {items.map((item) => {
          const Icon =
            item.confidence === "high" ? CheckCircle2 : item.confidence === "medium" ? CircleAlert : AlertTriangle;
          return (
            <li className="detected-row" key={item.id}>
              <span className={`detected-type detected-type-${item.item_type}`}>{item.item_type.toUpperCase()}</span>
              <div className="detected-title">
                <h3>{item.title}</h3>
                <p>{item.signal_value ?? "No timing signal found"}</p>
              </div>
              <div className="detected-estimate">
                {editing === item.id ? (
                  <form
                    className="detected-edit"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void save(item);
                    }}
                  >
                    <Input
                      type="number"
                      min="1"
                      max="10080"
                      step="1"
                      required
                      value={minutes}
                      disabled={saving}
                      aria-label={`Estimated minutes for ${item.title}`}
                      onChange={(e) => setMinutes(e.target.value)}
                      autoFocus
                    />
                    <span>min</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Save estimate"
                      title="Save estimate"
                      disabled={saving}
                    >
                      <Check size={15} />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Cancel edit"
                      title="Cancel edit"
                      disabled={saving}
                      onClick={() => {
                        setEditing(null);
                        setEditError(null);
                      }}
                    >
                      <X size={15} />
                    </Button>
                  </form>
                ) : (
                  <Button
                    variant="ghost"
                    className="detected-time-button"
                    disabled={busy || saving || !item.assignment_id}
                    onClick={() => {
                      setEditing(item.id);
                      setMinutes(String(item.estimated_minutes ?? 30));
                      setEditError(null);
                    }}
                    aria-label={`Edit estimated time for ${item.title}`}
                    title="Edit estimated time"
                  >
                    {item.estimated_minutes ?? 0} min
                    <Pencil size={12} />
                  </Button>
                )}
                {item.estimated_is_manual && <span className="detected-manual">manual</span>}
              </div>
              <span className={`detected-confidence confidence-${item.confidence}`}>
                <Icon size={12} aria-hidden="true" />
                {item.confidence[0]?.toUpperCase()}
                {item.confidence.slice(1)}
              </span>
            </li>
          );
        })}
      </ul>
      {editError && (
        <p role="alert" className="text-destructive">
          {editError}
        </p>
      )}
      {ready && (
        <div className="detected-total">
          <strong>
            Total this week: est. {Math.floor(total / 60)}h {total % 60}m
          </strong>
          <p>
            Estimates come from video length, word counts, quiz time limits, and rubric targets. Missing signals use a
            built-in estimate.
          </p>
        </div>
      )}
      {summary && (
        <div className="connect-confirm">
          <h2>Your plan is ready</h2>
          <p>
            {summary.assignments} assignments broken into {summary.steps} steps.
          </p>
          <p>
            First deadline:{" "}
            {summary.firstDeadline
              ? new Date(summary.firstDeadline).toLocaleString(undefined, {
                  timeZone: timezone,
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "No deadline this week"}
          </p>
          {summary.redTitles.length > 0 ? (
            <p className="detect-warning">
              <AlertTriangle size={16} aria-hidden="true" />
              No room to be behind: {summary.redTitles.join(", ")}
            </p>
          ) : (
            <p className="connect-success">
              <CheckCircle2 size={16} aria-hidden="true" />
              No red buffers.
            </p>
          )}
          {summary.failed > 0 && (
            <p className="detect-warning" role="status">
              <AlertTriangle size={16} aria-hidden="true" />
              {summary.failed} assignment(s) could not be planned yet. Reopen this tab or press Try again to retry.
            </p>
          )}
          <p className="detect-sublabel">
            Steps were written for each assignment from its own instructions. Adjust any estimate above, then open the
            Map tab.
          </p>
        </div>
      )}
    </section>
  );
}
