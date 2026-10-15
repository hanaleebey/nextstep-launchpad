// The app's only path to the AI model: the `agent-estimate` Supabase Edge
// Function in the developer's own Supabase project.
// The function returns { minutes, confidence, steps[] } on success, or
// { error: { code, message } } - with HTTP 200 - when the model call failed.
// Both shapes must be checked: the HTTP error only covers transport failures.
import { supabase } from "@/integrations/supabase/client";
import { decompose, type DecomposedStep } from "./decompose";
import { sanitizeAiSteps } from "./ai-steps";

export interface AgentAssignment {
  title: string;
  type: string;
  due_at: string | null;
  description?: string | undefined;
  word_count?: number;
  estimated_minutes?: number | null;
}

export interface PlanResult {
  steps: DecomposedStep[];
  source: "ai" | "fallback";
  note: string | null;
}

/** Pull the server's error message out of either failure shape. */
async function serverMessage(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: Response } | undefined)?.context;
  if (!ctx || typeof ctx.json !== "function") return null;
  const body = await ctx.json().catch(() => null);
  const message = (body as { error?: { message?: string } } | null)?.error?.message;
  return typeof message === "string" && message.trim() ? message : null;
}

export async function planAssignment(assignment: AgentAssignment): Promise<PlanResult> {
  const fallback = (note: string): PlanResult => ({
    steps: decompose({
      title: assignment.title,
      type: assignment.type,
      dueAt: assignment.due_at,
      estimatedMinutes: assignment.estimated_minutes ?? null,
    }),
    source: "fallback",
    note,
  });
  try {
    const { data, error } = await supabase.functions.invoke("agent-estimate", { body: { mode: "plan", assignment } });
    if (error) {
      // Transport-level failure (non-2xx, network, timeout).
      return fallback((await serverMessage(error)) ?? "AI unavailable");
    }
    // Model-side failure: HTTP 200 with an error body. Check it BEFORE trying
    // to read steps, otherwise the real reason is reported as "unusable output".
    const typed = data as { error?: { code?: string; message?: string } } | null;
    if (typed?.error?.message) return fallback(typed.error.message);
    // Defence in depth: re-check the shape before trusting it.
    const steps = sanitizeAiSteps(data);
    return steps ? { steps, source: "ai", note: null } : fallback("AI output was unusable");
  } catch (e) {
    return fallback(e instanceof Error ? e.message : "AI unavailable");
  }
}

// ---------- refine mode ----------
// Used by estimate.ts only when the deterministic estimate is weak. Returns
// null on ANY problem (error, typed error body, bad shape, timeout) so the
// caller silently keeps its deterministic result. Never throws.
export interface RefinePayload {
  title: string;
  type: string;
  description: string;
  signals: string[];
  rubric: string[];
  deterministic: { minutes: number; confidence: string };
}
export interface RefineResult {
  minutes: number;
  confidence: "high" | "medium" | "low";
  steps: DecomposedStep[];
}
export const REFINE_TIMEOUT_MS = 12_000;

export async function refineWithAgent(
  assignment: RefinePayload,
  timeoutMs = REFINE_TIMEOUT_MS,
): Promise<RefineResult | null> {
  try {
    const call = supabase.functions.invoke("agent-estimate", { body: { mode: "refine", assignment } });
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
    const res = await Promise.race([call, timeout]);
    if (!res || res.error || !res.data || res.data.error) return null;
    const d = res.data as { minutes?: unknown; confidence?: unknown };
    const minutes = typeof d.minutes === "number" && Number.isFinite(d.minutes) ? Math.round(d.minutes) : NaN;
    if (!(minutes >= 5 && minutes <= 6000)) return null;
    const confidence =
      d.confidence === "high" || d.confidence === "medium" || d.confidence === "low" ? d.confidence : null;
    const steps = sanitizeAiSteps(res.data);
    if (!confidence || !steps) return null;
    return { minutes, confidence, steps };
  } catch {
    return null;
  }
}
