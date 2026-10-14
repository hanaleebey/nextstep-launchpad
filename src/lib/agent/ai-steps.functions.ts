// Server function: generate steps with AI, falling back to the deterministic
// planner whenever AI fails or returns unusable output.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { decompose, type DecomposedStep } from "./decompose";
import { sanitizeAiSteps, type AiStepsInput } from "./ai-steps";

export interface AiStepsResult {
  steps: DecomposedStep[];
  source: "ai" | "fallback";
  note: string | null;
}

export const generateAiSteps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: AiStepsInput) => ({
    title: String(d.title ?? "").slice(0, 200),
    type: String(d.type ?? "project").slice(0, 40),
    dueAt: d.dueAt ? String(d.dueAt) : null,
    estimatedMinutes: typeof d.estimatedMinutes === "number" && d.estimatedMinutes > 0 ? Math.min(d.estimatedMinutes, 2000) : null,
    details: d.details ? String(d.details).slice(0, 1000) : undefined,
  }))
  .handler(async ({ data }): Promise<AiStepsResult> => {
    const fallback = (note: string): AiStepsResult => ({ steps: decompose(data), source: "fallback", note });
    try {
      const { callAiSteps } = await import("./ai-steps.server");
      const steps = sanitizeAiSteps(await callAiSteps(data));
      return steps ? { steps, source: "ai", note: null } : fallback("AI output was unusable");
    } catch (e) {
      return fallback(e instanceof Error ? e.message : "AI unavailable");
    }
  });
