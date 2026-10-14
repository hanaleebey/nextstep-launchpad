// Calibration: learn how fast this student really works, per item type.
//
// Pure functions only — no database. calibrate-persist.ts does the saving.
//
// The flow:
//   1. checkSample()      — is this one timed step trustworthy? If not, why?
//   2. resolveSuspect()   — the student's answer to "did the timer keep running?"
//   3. computeMultiplier() — median of usable ratios, clamped, blended with the old value.
//   4. describe...()      — plain-language activity messages.
//
// Two hard rules:
//   - never calibrate DOWN from an untimed completion (null actual is rejected),
//   - never calibrate UP from a running-timer sample (rejected unless the
//     student confirms it, and even then its ratio is capped at 1.8).

export const MIN_MULTIPLIER = 0.6;
export const MAX_MULTIPLIER = 1.8;
export const MIN_SAMPLES = 3; // usable samples needed before we adjust anything
export const TRIM_AT = 5; // with this many samples, drop the highest and lowest ratio
export const BLEND = 0.5; // weight of the new value when blending
export const RUNAWAY_FACTOR = 3; // actual > 3x estimate looks like a forgotten timer
export const RUNAWAY_MINUTES = 180; // or more than 3 hours on a single step

export const CALIBRATION_TYPES = ["reading", "writing", "quiz", "video"] as const;
export type CalibrationType = (typeof CALIBRATION_TYPES)[number];

export type ExcludedReason = "no_timer" | "too_short" | "timer_left_running";

export interface Sample {
  item_type: string;
  estimated_minutes: number;
  /** null = the step was marked done without starting the timer. Never 0 for that. */
  actual_minutes: number | null;
  /** Set when the student said "That time is accurate" for a suspect sample. */
  confirmed_accurate?: boolean;
}

export interface SampleCheck {
  usable: boolean;
  reason: ExcludedReason | null;
  /** actual / estimated, capped at MAX_MULTIPLIER for confirmed slow sessions. null if unusable. */
  ratio: number | null;
}

export const clamp = (x: number, lo = MIN_MULTIPLIER, hi = MAX_MULTIPLIER) => Math.min(hi, Math.max(lo, x));

/** STEP 1 — decide whether a single sample may move the multiplier. */
export function checkSample(s: Sample): SampleCheck {
  const actual = s.actual_minutes;
  if (actual === null || actual === undefined) return { usable: false, reason: "no_timer", ratio: null };
  if (actual < 1) return { usable: false, reason: "too_short", ratio: null };

  const runaway = actual > RUNAWAY_FACTOR * s.estimated_minutes || actual > RUNAWAY_MINUTES;
  if (runaway && !s.confirmed_accurate) return { usable: false, reason: "timer_left_running", ratio: null };

  const raw = actual / Math.max(1, s.estimated_minutes);
  // A confirmed slow session still counts, but can't dominate.
  const ratio = runaway ? Math.min(raw, MAX_MULTIPLIER) : raw;
  return { usable: true, reason: null, ratio };
}

/**
 * STEP 2 — apply the student's answer to the "did the timer keep running?" prompt.
 *  - "kept_running" (also the default if dismissed): discard, unless they typed
 *    the real time, which then replaces actual_minutes.
 *  - "accurate": keep the sample, ratio capped at 1.8 by checkSample().
 */
export type SuspectAnswer = { kind: "kept_running"; realMinutes?: number | null } | { kind: "accurate" } | { kind: "dismissed" };

export function resolveSuspect(s: Sample, answer: SuspectAnswer): Sample | null {
  if (answer.kind === "accurate") return { ...s, confirmed_accurate: true };
  if (answer.kind === "kept_running" && answer.realMinutes != null && answer.realMinutes > 0) {
    return { ...s, actual_minutes: answer.realMinutes, confirmed_accurate: false };
  }
  return null; // discard
}

/** Text for the suspect prompt, e.g. "That was 4h 12m for a 30-minute step - did the timer keep running?" */
export function suspectPrompt(s: Sample): string {
  const a = Math.round(s.actual_minutes ?? 0);
  const h = Math.floor(a / 60);
  const m = a % 60;
  const took = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return `That was ${took} for a ${s.estimated_minutes}-minute step - did the timer keep running?`;
}

/** Median of a list (average of the two middle values for even lengths). */
export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export interface MultiplierResult {
  multiplier: number;
  changed: boolean;
  usableCount: number;
  rejectedCount: number;
  /** "insufficient" = under MIN_SAMPLES usable; "mostly_rejected" = more rejected than usable. */
  status: "updated" | "insufficient" | "mostly_rejected";
}

/**
 * STEP 3 — compute one type's multiplier from its samples.
 * Fewer than 3 usable samples: unchanged. Most samples rejected: reset to 1.0.
 */
export function computeMultiplier(samples: Sample[], oldMultiplier = 1): MultiplierResult {
  const checks = samples.map(checkSample);
  const ratios = checks.filter((c) => c.usable).map((c) => c.ratio as number);
  const rejectedCount = checks.length - ratios.length;
  const base = { usableCount: ratios.length, rejectedCount };

  if (rejectedCount > ratios.length) return { ...base, multiplier: 1, changed: oldMultiplier !== 1, status: "mostly_rejected" };
  if (ratios.length < MIN_SAMPLES) return { ...base, multiplier: oldMultiplier, changed: false, status: "insufficient" };

  // Trim one outlier at each end once we have enough data.
  const sorted = [...ratios].sort((a, b) => a - b);
  const trimmed = sorted.length >= TRIM_AT ? sorted.slice(1, -1) : sorted;
  const target = clamp(median(trimmed));
  const blended = clamp(oldMultiplier * (1 - BLEND) + target * BLEND);
  const multiplier = Math.round(blended * 100) / 100;
  return { ...base, multiplier, changed: multiplier !== oldMultiplier, status: "updated" };
}

/** STEP 4 — plain-language message for the activity log. */
export function describeCalibration(type: string, oldM: number, r: MultiplierResult): string {
  if (r.status === "mostly_rejected") return `${cap(type)}: not enough reliable timed steps yet - using default estimates.`;
  if (r.status === "insufficient") return `${cap(type)}: ${r.usableCount} of ${MIN_SAMPLES} timed steps needed before calibrating.`;
  if (type === "reading") {
    // Show it as reading speed: a 1.15x multiplier means ~174 wpm instead of 200.
    return `Calibrated reading estimate: ${Math.round(200 / oldM)} -> ${Math.round(200 / r.multiplier)} wpm (your pace)`;
  }
  return `Calibrated ${type} estimate: x${oldM.toFixed(2)} -> x${r.multiplier.toFixed(2)} (your pace)`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
