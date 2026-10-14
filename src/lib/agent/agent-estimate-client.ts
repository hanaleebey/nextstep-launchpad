// The app's only path to the AI model: the `agent-estimate` Supabase Edge
// Function in the developer's own Supabase project (deployed with the CLI).
// The function returns { minutes, confidence, steps[] } or a labelled error;
// on any error we fall back to the deterministic decompose() planner.
import { supabase } from "@/integrations/supabase/client";
import { decompose, type DecomposedStep } from "./decompose";
import { sanitizeAiSteps } from "./ai-steps";

export interface AgentAssignment {
  title: string;
  type: string;
  due_at: string | null;
  description?: string;
  word_count?: number;
  estimated_minutes?: number | null;
}

export interface PlanResult {
  steps: DecomposedStep[];
  source: "ai" | "fallback";
  note: string | null;
}

export async function planAssignment(assignment: AgentAssignment): Promise<PlanResult> {
  const fallback = (note: string): PlanResult => ({
    steps: decompose({ title: assignment.title, type: assignment.type, dueAt: assignment.due_at, estimatedMinutes: assignment.estimated_minutes ?? null }),
    source: "fallback",
    note,
  });
  try {
    const { data, error } = await supabase.functions.invoke("agent-estimate", { body: { mode: "plan", assignment } });
    if (error) {
      // Labelled error body from the function, when present.
      const ctx = (error as { context?: Response }).context;
      const body = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
      return fallback(body?.error?.message ?? "AI unavailable");
    }
    // Defence in depth: re-check the shape before trusting it.
    const steps = sanitizeAiSteps(data);
    return steps ? { steps, source: "ai", note: null } : fallback("AI output was unusable");
  } catch (e) {
    return fallback(e instanceof Error ? e.message : "AI unavailable");
  }
}
