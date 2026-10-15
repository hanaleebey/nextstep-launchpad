// Deterministic time estimation (no AI).
// Pure functions only: callers gather the raw signals (e.g. the server-side
// sync fetches YouTube oEmbed / Moodle data) and pass them in here.
//
// Rules:
//   video   : duration (seconds) / 60 × 1.0
//   reading : word count / 200 wpm
//   quiz    : time limit (seconds) / 60 when set — a timed quiz's limit IS the
//             time it takes, so confidence is always high. Otherwise
//             question count × 1.5 min.
//   writing : target words / 250 wpm × 1.2 (20% editing overhead)
//   fallback: 30 min
//
// Confidence = how many signals we had:
//   2+ signals → high, 1 → medium, 0 (fallback) → low.
//   Exception: a quiz time limit alone is high (see above).

import type { Confidence } from "@/types/nextstep";

export interface EstimateResult {
  minutes: number;
  confidence: Confidence;
  /** Human-readable list of the signals used, e.g. "word count: 4000". */
  signals: string[];
}

export const FALLBACK_MINUTES = 30;
export const READING_WPM = 200;
export const WRITING_WPM = 250;
export const EDITING_OVERHEAD = 0.2;
export const MINUTES_PER_QUESTION = 1.5;

/** Map a signal count to a confidence level. */
export function confidenceFromSignals(count: number): Confidence {
  if (count >= 2) return "high";
  if (count === 1) return "medium";
  return "low";
}

/** Shared fallback when no usable signal exists. */
export function fallbackEstimate(reason = "no signals available"): EstimateResult {
  return { minutes: FALLBACK_MINUTES, confidence: "low", signals: [`fallback: ${reason}`] };
}

/** True for a finite, positive number. */
function usable(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

// ---------- video ----------
export interface VideoSignals {
  durationSeconds?: number | null; // from YouTube metadata
  oembedTitle?: string | null; // oEmbed response confirms the video exists
}
export function estimateVideo(s: VideoSignals): EstimateResult {
  if (!usable(s.durationSeconds)) return { minutes: 20, confidence: "low", signals: ["fallback: video duration unknown"] };
  const signals = [`video duration: ${Math.round(s.durationSeconds)}s`];
  if (s.oembedTitle) signals.push(`oEmbed title: ${s.oembedTitle}`);
  return {
    minutes: Math.ceil((s.durationSeconds / 60) * 1.0),
    confidence: confidenceFromSignals(signals.length),
    signals,
  };
}

// ---------- reading ----------
export interface ReadingSignals {
  wordCount?: number | null;
  pageCount?: number | null; // supporting signal only (cross-check)
}
export function estimateReading(s: ReadingSignals): EstimateResult {
  if (!usable(s.wordCount)) return fallbackEstimate("word count unknown");
  const signals = [`word count: ${s.wordCount}`];
  if (usable(s.pageCount)) signals.push(`pages: ${s.pageCount}`);
  return {
    minutes: Math.ceil(s.wordCount / READING_WPM),
    confidence: confidenceFromSignals(signals.length),
    signals,
  };
}

// ---------- quiz ----------
export interface QuizSignals {
  timeLimitSeconds?: number | null; // Moodle `timelimit`; 0 means "no limit"
  questionCount?: number | null;
}
export function estimateQuiz(s: QuizSignals): EstimateResult {
  // Preferred: the quiz's own time limit.
  if (usable(s.timeLimitSeconds)) {
    return {
      minutes: Math.ceil(s.timeLimitSeconds / 60),
      confidence: "high",
      signals: [`quiz time limit: ${s.timeLimitSeconds}s`],
    };
  }
  // Untimed: question count × 1.5 min.
  if (usable(s.questionCount)) {
    return {
      minutes: Math.ceil(s.questionCount * MINUTES_PER_QUESTION),
      confidence: confidenceFromSignals(1),
      signals: [`question count: ${s.questionCount}`],
    };
  }
  return fallbackEstimate("no time limit or question count");
}

// ---------- writing ----------
export interface WritingSignals {
  targetWords?: number | null;
  hasRubric?: boolean; // supporting signal: scope is well defined
}
export function estimateWriting(s: WritingSignals): EstimateResult {
  if (!usable(s.targetWords)) return fallbackEstimate("target word count unknown");
  const signals = [`target words: ${s.targetWords}`];
  if (s.hasRubric) signals.push("rubric available");
  const drafting = s.targetWords / WRITING_WPM;
  return {
    minutes: Math.ceil(drafting * (1 + EDITING_OVERHEAD)),
    confidence: confidenceFromSignals(signals.length),
    signals,
  };
}

// ---------- dispatcher ----------
export type EstimateInput =
  | { kind: "video"; signals: VideoSignals }
  | { kind: "read"; signals: ReadingSignals }
  | { kind: "quiz"; signals: QuizSignals }
  | { kind: "writing"; signals: WritingSignals }
  | { kind: "other" };

/** Pick the rule for an item type. Unknown types use the 30-minute fallback. */
export function estimate(input: EstimateInput): EstimateResult {
  switch (input.kind) {
    case "video": return estimateVideo(input.signals);
    case "read": return estimateReading(input.signals);
    case "quiz": return estimateQuiz(input.signals);
    case "writing": return estimateWriting(input.signals);
    default: return fallbackEstimate("unknown item type");
  }
}

// ---------- Calibration hook ----------
// calibrate.ts learns a per-type multiplier (0.6–1.8) from the student's real
// timed steps. Applying it here keeps estimate() itself unchanged and pure.

/** Map an estimate kind to the calibration bucket it belongs to. */
export function calibrationTypeFor(kind: EstimateInput["kind"]): string | null {
  switch (kind) {
    case "read": return "reading";
    case "writing": return "writing";
    case "quiz": return "quiz";
    case "video": return "video";
    default: return null;
  }
}

/**
 * Same as estimate(), then scaled by the student's multiplier for that type.
 * `multipliers` is e.g. { reading: 1.15 }; a missing type means 1.0.
 */
export function estimateCalibrated(input: EstimateInput, multipliers: Record<string, number>): EstimateResult {
  const base = estimate(input);
  const type = calibrationTypeFor(input.kind);
  const m = type ? multipliers[type] ?? 1 : 1;
  if (m === 1) return base;
  return {
    ...base,
    minutes: Math.max(1, Math.round(base.minutes * m)),
    signals: [...base.signals, `calibrated x${m.toFixed(2)} (your pace)`],
  };
}

// ---------- AI refinement (optional upgrade) ----------
// The deterministic estimate is always computed first. Only when it is weak
// (confidence 'low') or the assignment is complex do we ask the agent-estimate
// function (mode 'refine') for a better number and steps. Any failure, timeout
// or typed error means we silently keep the deterministic result.

export interface RefineContext {
  title: string;
  type: string;
  /** Moodle `intro` (HTML allowed — stripped before sending). */
  introHtml?: string | null;
  rubric?: string[];
}

export interface RefinedEstimate extends EstimateResult {
  aiRefined: boolean;
  /** AI steps when refined; null means "use the deterministic planner". */
  steps: import("./decompose").DecomposedStep[] | null;
}

/** Turn Moodle HTML into plain text (tags removed, entities decoded, whitespace collapsed). */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

const OPEN_ENDED_TYPES = new Set(["paper", "project", "essay", "research"]);
export const COMPLEX_RUBRIC_ITEMS = 3;
export const COMPLEX_DESCRIPTION_WORDS = 250;

/** Complex = open-ended type, a rubric of 3+ criteria, or a long brief. */
export function isComplex(ctx: RefineContext): boolean {
  if (OPEN_ENDED_TYPES.has(ctx.type.toLowerCase())) return true;
  if ((ctx.rubric?.length ?? 0) >= COMPLEX_RUBRIC_ITEMS) return true;
  const words = stripHtml(ctx.introHtml).split(/\s+/).filter(Boolean).length;
  return words >= COMPLEX_DESCRIPTION_WORDS;
}

/** Call the model ONLY when confidence is low or the work is complex. */
export function shouldRefine(base: EstimateResult, ctx: RefineContext): boolean {
  return base.confidence === "low" || isComplex(ctx);
}

type RefineFn = (p: import("./agent-estimate-client").RefinePayload) =>
  Promise<import("./agent-estimate-client").RefineResult | null>;

/**
 * Upgrade a deterministic estimate with the agent when warranted.
 * `refineFn` is injectable for tests; by default the client is loaded lazily so
 * the pure functions above never pull in network code.
 */
export async function refineEstimate(base: EstimateResult, ctx: RefineContext, refineFn?: RefineFn): Promise<RefinedEstimate> {
  const keep: RefinedEstimate = { ...base, aiRefined: false, steps: null };
  if (!shouldRefine(base, ctx)) return keep;
  try {
    const call = refineFn ?? (await import("./agent-estimate-client")).refineWithAgent;
    const ai = await call({
      title: ctx.title,
      type: ctx.type,
      description: stripHtml(ctx.introHtml).slice(0, 4000),
      signals: base.signals,
      rubric: (ctx.rubric ?? []).map((r) => stripHtml(r)).filter(Boolean).slice(0, 20),
      deterministic: { minutes: base.minutes, confidence: base.confidence },
    });
    if (!ai) return keep;
    return {
      minutes: ai.minutes,
      confidence: ai.confidence,
      signals: [...base.signals, `AI-refined from ${base.minutes} min`],
      aiRefined: true,
      steps: ai.steps,
    };
  } catch {
    return keep; // model unavailable: deterministic estimate stands
  }
}
