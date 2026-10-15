// Pure checks for AI-generated steps. The model's output is never trusted
// as-is: this file reshapes it to NextStep's rules (1–8 steps, 1–50 min
// timeboxes, 1–4 "good-enough" checks). A plain video can be a single
// "Watch" step, and short work keeps its exact minutes.
// If the output can't be repaired, it returns null and the caller decides
// what to do (it never saves generic template steps in its place).
import { MAX_STEPS, MAX_TIMEBOX, type DecomposedStep } from "./decompose";

export const AI_MIN_STEPS = 1;
export const AI_MIN_TIMEBOX = 1;
export const AI_MAX_CRITERIA = 4;

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

/** Whole minutes, kept inside 1–50. */
function clampTimebox(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 15;
  return Math.min(MAX_TIMEBOX, Math.max(AI_MIN_TIMEBOX, Math.round(v)));
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
        ? s.done_criteria.filter((c): c is string => typeof c === "string" && c.trim().length > 0).map((c) => c.trim()).slice(0, AI_MAX_CRITERIA)
        : [];
      return {
        order_index: i,
        title: (s.title as string).trim().slice(0, 140),
        timebox_minutes: clampTimebox(s.timebox_minutes),
        done_criteria: criteria.length ? criteria : ["Step finished, good enough"],
      };
    });
  return steps.length >= AI_MIN_STEPS ? steps : null;
}

/** Instructions for the model. Plain language, startable steps, no decisions left. */
export function buildPrompt(input: AiStepsInput, now = new Date()): string {
  return [
    "You are a coach for a college student with ADHD. Break THIS assignment into small, ordered steps based on its own instructions — never generic template steps.",
    `Rules: ${AI_MIN_STEPS}-${MAX_STEPS} steps, as few as the work needs. A plain video is one step: "Watch <title>".`,
    'Readings split by real structure (e.g. "Read pages 1-3 and take notes"). Each step: short imperative title, startable without a decision;',
    `timebox_minutes between ${AI_MIN_TIMEBOX} and ${MAX_TIMEBOX}; 1-${AI_MAX_CRITERIA} concrete "good-enough done" checks. Across the plan, checks must cover each instruction or required element in the details.`,
    input.estimatedMinutes ? `Timeboxes should add up to about ${input.estimatedMinutes} minutes.` : "Pick a realistic total time.",
    "",
    `Today: ${now.toISOString().slice(0, 10)}`,
    `Assignment: ${input.title}`,
    `Type: ${input.type}`,
    `Due: ${input.dueAt ?? "no deadline given"}`,
    input.details ? `Details: ${input.details}` : "",
  ].join("\n");
}
