// Side-effecting half of calibration: record samples, recompute and save multipliers.
import { supabase } from "@/integrations/supabase/client";
import { addEstimateEvent, listEstimateEvents, logActivity } from "@/lib/db";
import type { Confidence } from "@/types/nextstep";
import { CALIBRATION_TYPES, checkSample, computeMultiplier, describeCalibration, type Sample } from "./calibrate";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Saved multipliers, e.g. { reading: 1.15 }. Missing types mean 1.0. */
export async function getMultipliers(): Promise<Record<string, number>> {
  const { data, error } = await db.from("calibration_multipliers").select("item_type, multiplier");
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((r: { item_type: string; multiplier: number }) => [r.item_type, Number(r.multiplier)]));
}

/**
 * Record one completed step. EVERY sample is written (rejected ones too, with
 * calibration_used=false and the reason) so the history stays auditable.
 * Untimed completions must be passed as actual_minutes = null, never 0.
 */
export async function recordSample(assignmentId: string, sample: Sample, confidence: Confidence = "medium") {
  const check = checkSample(sample);
  await addEstimateEvent({
    assignment_id: assignmentId,
    item_type: sample.item_type,
    estimated_minutes: sample.estimated_minutes,
    actual_minutes: sample.actual_minutes,
    confidence,
    calibration_used: check.usable,
    excluded_reason: check.reason,
  });
  return check;
}

/** Turn stored events of one type into calibration samples (completed steps only). */
function samplesOf(events: Awaited<ReturnType<typeof listEstimateEvents>>, type: string): Sample[] {
  // Pure estimate logs have no actual and no explicit decision — skip them.
  return events
    .filter((e) => e.item_type === type && (e.actual_minutes !== null || e.excluded_reason !== null))
    .map((e) => ({
      item_type: e.item_type,
      estimated_minutes: e.estimated_minutes,
      actual_minutes: e.actual_minutes,
      // A runaway sample stored as used means the student confirmed it.
      confirmed_accurate: e.calibration_used === true && e.excluded_reason === null,
    }));
}

/** Recompute every type's multiplier from usable history, save it, and log what changed. */
export async function recalibrate(): Promise<{ multipliers: Record<string, number>; messages: string[] }> {
  const [events, old] = await Promise.all([listEstimateEvents(), getMultipliers()]);
  const out: Record<string, number> = { ...old };
  const messages: string[] = [];

  for (const type of CALIBRATION_TYPES) {
    const samples = samplesOf(events, type);
    if (samples.length === 0) continue;

    const prev = old[type] ?? 1;
    const r = computeMultiplier(samples, prev);
    if (r.changed) {
      const { error } = await db
        .from("calibration_multipliers")
        .upsert({ item_type: type, multiplier: r.multiplier, sample_count: r.usableCount }, { onConflict: "user_id,item_type" });
      if (error) throw new Error(error.message);
      out[type] = r.multiplier;
    }
    const msg = describeCalibration(type, prev, r);
    messages.push(msg);
    if (r.changed || r.status === "mostly_rejected") await logActivity("calibrate", msg);
  }
  return { multipliers: out, messages };
}

/** What Settings shows: per type, the multiplier and how many usable timed steps back it. */
export async function getCalibrationSummary(): Promise<{ type: string; multiplier: number; usable: number }[]> {
  const [events, mult] = await Promise.all([listEstimateEvents(), getMultipliers()]);
  return CALIBRATION_TYPES.map((type) => ({
    type,
    multiplier: mult[type] ?? 1,
    usable: computeMultiplier(samplesOf(events, type), mult[type] ?? 1).usableCount,
  }));
}
