// Pure checks for AI-generated steps. The model's output is never trusted
// as-is: this file reshapes it to the same rules the deterministic planner
// follows (4–8 steps, 15–50 min timeboxes, 1–3 "good-enough" checks).
// If the output can't be repaired, it returns null and the caller falls back
// to decompose.ts — so the app never breaks when AI is unavailable.
import { MAX_STEPS, MAX_TIMEBOX, MIN_STEPS, MIN_TIMEBOX, type DecomposedStep } from "./decompose";

export interface AiStepsInput {
  title: string;
  type: string;
  dueAt: string | null;
  estimatedMinutes: number | null;
  details?: string | undefined;
}

/** JSON schema sent to the model (strict: all fields required, no extras). */
export const AI_STEPS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["steps"],
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "timebox_minutes", "done_criteria"],
        properties: {
          title: { type: "string" },
          timebox_minutes: { type: "integer" },
          done_criteria: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

/** Round to 5 minutes and keep inside the timebox limits. */
function clampTimebox(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : MIN_TIMEBOX;
  return Math.min(MAX_TIMEBOX, Math.max(MIN_TIMEBOX, Math.round(v / 5) * 5));
}

/** Turn raw model output into valid steps, or null if it can't be used. */
export function sanitizeAiSteps(raw: unknown): DecomposedStep[] | null {
  const list = (raw as { steps?: unknown })?.steps;
  if (!Array.isArray(list)) return null;
  const steps = list
    .map((s) => s as { title?: unknown; timebox_minutes?: unknown; done_criteria?: unknown })
    .filter((s) => typeof s.title === "string" && s.title.trim().length > 0)
    .slice(0, MAX_STEPS)
    .map((s, i) => {
      const criteria = Array.isArray(s.done_criteria)
        ? s.done_criteria.filter((c): c is string => typeof c === "string" && c.trim().length > 0).map((c) => c.trim()).slice(0, 3)
        : [];
      return {
        order_index: i,
        title: (s.title as string).trim().slice(0, 140),
        timebox_minutes: clampTimebox(s.timebox_minutes),
        done_criteria: criteria.length ? criteria : ["Step finished, good enough"],
      };
    });
  return steps.length >= MIN_STEPS ? steps : null;
}

/** Instructions for the model. Plain language, startable steps, no decisions left. */
export function buildPrompt(input: AiStepsInput, now = new Date()): string {
  return [
    "You are a coach for a college student with ADHD. Break this assignment into small, ordered steps.",
    `Rules: ${MIN_STEPS}-${MAX_STEPS} steps. Each step: a short imperative title the student can start immediately without making any decision;`,
    `timebox_minutes between ${MIN_TIMEBOX} and ${MAX_TIMEBOX}; 1-3 concrete "good-enough done" checks. Plain language, no jargon.`,
    input.estimatedMinutes ? `Timeboxes should add up to about ${input.estimatedMinutes} minutes.` : "Pick a realistic total time.",
    "",
    `Today: ${now.toISOString().slice(0, 10)}`,
    `Assignment: ${input.title}`,
    `Type: ${input.type}`,
    `Due: ${input.dueAt ?? "no deadline given"}`,
    input.details ? `Details from the student: ${input.details}` : "",
  ].join("\n");
}
