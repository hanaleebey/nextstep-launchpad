// supabase/functions/agent-estimate/index.ts
//
// NextStep's single model path. Two modes:
//   mode: 'plan'   -> generate 1-8 timeboxed steps for an assignment that has none
//   mode: 'refine' -> upgrade a low-confidence deterministic estimate and its steps
//
// Contract:
//   Request : { mode, assignment: { title, type, due_at, description?, word_count?,
//                                   estimated_minutes? }, signals? }
//   Success : { minutes, confidence: 'high'|'medium'|'low',
//               steps: [{ title, timebox_minutes, done_criteria: string[] }] }
//   Failure : { error: { code, message } }
//
// Secrets (set with `supabase secrets set ...`):
//   MODEL_API_KEY        required - your model provider's API key.
//   MODEL_BASE_URL       optional - any OpenAI-compatible endpoint. Default:
//                        https://api.openai.com/v1
//                          Gemini      https://generativelanguage.googleapis.com/v1beta/openai
//                          OpenRouter  https://openrouter.ai/api/v1
//                          Groq        https://api.groq.com/openai/v1
//   MODEL_NAME           optional - default gpt-4o-mini (e.g. gemini-3.8-flash).
//   MODEL_NAME_FALLBACK  optional - tried when the primary model is retired,
//                        overloaded, or rate-limited. Strongly recommended:
//                        providers retire model names and shed load without notice.
//
// The provider is a setting, not a rewrite.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL_TIMEOUT_MS = 15_000;
/** Attempts per model. 429/5xx are transient - capacity spikes clear in seconds. */
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [600, 1500];
/** Statuses worth retrying: rate limits and provider-side failures. */
const TRANSIENT_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

type Confidence = "high" | "medium" | "low";

interface Step {
  title: string;
  timebox_minutes: number;
  done_criteria: string[];
}

interface Estimate {
  minutes: number;
  confidence: Confidence;
  steps: Step[];
}

interface ErrBody {
  error: { code: string; message: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function ok(body: Estimate): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Model-side failures return 200 with an `error` body so the client can read
// error.message and fall back to the built-in planner.
function fail(code: string, message: string, status = 200): Response {
  const body: ErrBody = { error: { code, message } };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function stripHtml(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

// Strict validation. Anything that does not match the shape exactly is rejected,
// which makes the client fall back to the deterministic planner rather than
// rendering a half-finished plan.
function validate(raw: unknown): Estimate | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const minutes = Number(o.minutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;

  const confidence = o.confidence;
  if (confidence !== "high" && confidence !== "medium" && confidence !== "low") return null;

  // 1 step is valid: a plain video is just "Watch ...".
  if (!Array.isArray(o.steps) || o.steps.length < 1 || o.steps.length > 8) return null;

  const steps: Step[] = [];
  for (const item of o.steps) {
    if (!item || typeof item !== "object") return null;
    const s = item as Record<string, unknown>;

    const title = typeof s.title === "string" ? s.title.trim() : "";
    if (!title) return null;

    const timebox = Number(s.timebox_minutes);
    if (!Number.isFinite(timebox)) return null;

    const rawCriteria = s.done_criteria;
    if (!Array.isArray(rawCriteria) || rawCriteria.length < 1 || rawCriteria.length > 4) {
      return null;
    }
    const criteria = rawCriteria
      .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
      .map((c) => c.trim().slice(0, 200));
    if (criteria.length !== rawCriteria.length) return null;

    steps.push({
      title: title.slice(0, 140),
      // Exact minutes (a 4-minute video stays 4), capped at 50 per step.
      timebox_minutes: Math.min(50, Math.max(1, Math.round(timebox))),
      done_criteria: criteria,
    });
  }

  return { minutes: Math.max(1, Math.round(minutes)), confidence, steps };
}

const SYSTEM_PROMPT = `You are the planning engine inside NextStep, a study assistant for college students with ADHD.

You turn one assignment into small, concrete, timeboxed steps. Your job is to remove the
need for the student to decide what to do next.

Rules:
- Base every step on THIS assignment's own title and details. Never use generic template steps.
- Use as few steps as the work needs: 1 to 8. Do not pad.
- Video: one step "Watch <title>" with the video's length as the timebox, unless the details
  ask for more (e.g. answer questions, take notes, post a reflection) - then add only those.
- Reading: split by the real structure in the details, e.g. "Read sections 1-2" or
  "Read pages 1-3 and take notes". If no structure is given, split into equal named parts.
- Quiz: name the topics it covers when known; the last step is taking the quiz.
- Writing/projects/discussions: steps follow the actual instructions, in order.
- Each step has timebox_minutes, an integer from 1 to 50 (short tasks keep their exact length).
- Each step has done_criteria: 1 to 4 short, checkable statements defining "good enough".
- Across the plan, criteria must cover every instruction or required element in the details
  (e.g. "Thesis states your position on X", "Includes 2 cited sources", "300+ words").
  Put each requirement on the step where it is done - not on every step.
- Every step must be startable without further decisions.
- The timeboxes must sum to roughly the assignment's total estimated time.
- Avoid vague verbs like "review" or "work on". Name the concrete action.
- If rubric criteria are supplied, ground the done_criteria in them.
- If details are missing, make a reasonable assumption and continue. Never ask questions.

Reply with JSON only, exactly this shape:
{"minutes": <integer>, "confidence": "high" | "medium" | "low", "steps": [{"title": "...", "timebox_minutes": <integer>, "done_criteria": ["..."]}]}`;

function userPrompt(mode: string, assignment: Record<string, unknown>, signals: unknown): string {
  const lines: string[] = [];
  lines.push(`Mode: ${mode === "refine" ? "refine an existing estimate" : "plan a new assignment"}`);
  lines.push(`Title: ${String(assignment.title ?? "Untitled")}`);
  if (assignment.type) lines.push(`Type: ${String(assignment.type)}`);
  if (assignment.due_at) lines.push(`Due: ${String(assignment.due_at)}`);
  if (assignment.word_count) lines.push(`Word count: ${String(assignment.word_count)}`);
  if (assignment.estimated_minutes) {
    lines.push(`Current estimate: ${String(assignment.estimated_minutes)} minutes`);
  }

  const description = stripHtml(assignment.description);
  if (description) lines.push(`Assignment details: ${description}`);

  if (signals && typeof signals === "object") {
    lines.push(`Detected signals: ${JSON.stringify(signals).slice(0, 2000)}`);
  }
  return lines.join("\n");
}

interface AttemptResult {
  content: string | null;
  /** Human-readable reason the last attempt failed. */
  failure: string;
}

/** One model, retried through transient failures. */
async function callModel(baseUrl: string, apiKey: string, model: string, body: unknown): Promise<AttemptResult> {
  let failure = "No attempt was made.";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          // If your provider rejects response_format, delete this line -
          // validate() below is the real guard.
          response_format: { type: "json_object" },
          messages: body,
        }),
        signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
      });
    } catch (err) {
      const name = (err as { name?: string })?.name;
      const timedOut = name === "TimeoutError" || name === "AbortError";
      console.error(
        `agent-estimate fetch error: model=${model} attempt=${attempt} ${String((err as Error)?.message ?? err).slice(0, 200)}`,
      );
      failure = timedOut ? "The model took too long to answer." : "Could not reach the model.";
      if (attempt < MAX_ATTEMPTS) {
        await sleep(BACKOFF_MS[attempt - 1] ?? 1500);
        continue;
      }
      break;
    }

    if (res.ok) {
      const payload = await res.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content === "string" && content.trim()) return { content, failure: "" };
      failure = "The model returned an empty answer.";
      break;
    }

    const detail = (await res.text()).slice(0, 300);
    // Log the reason and the model name only - never the key.
    console.error(
      `agent-estimate model failure: status=${res.status} model=${model} attempt=${attempt} detail=${detail}`,
    );

    if (res.status === 429 || res.status === 503) {
      failure = "The model is busy right now. Try again in a moment.";
    } else if (res.status === 404) {
      failure = `The model "${model}" is not available on this account. Check MODEL_NAME.`;
    } else {
      failure = `The model returned ${res.status}. ${detail}`;
    }

    if (TRANSIENT_STATUSES.has(res.status) && attempt < MAX_ATTEMPTS) {
      await sleep(BACKOFF_MS[attempt - 1] ?? 1500);
      continue;
    }
    break;
  }

  return { content: null, failure };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", "Use POST.", 405);

  // --- auth: reject anyone not signed in -----------------------------------
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return fail("UNAUTHENTICATED", "Sign in required.", 401);
  }
  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user) {
    return fail("UNAUTHENTICATED", "Sign in required.", 401);
  }

  // --- input ---------------------------------------------------------------
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("BAD_REQUEST", "Request body must be JSON.", 400);
  }

  const mode = body.mode === "refine" ? "refine" : body.mode === "plan" ? "plan" : null;
  if (!mode) return fail("BAD_REQUEST", "mode must be 'plan' or 'refine'.", 400);

  const assignment = body.assignment;
  if (!assignment || typeof assignment !== "object") {
    return fail("BAD_REQUEST", "assignment is required.", 400);
  }

  // --- model credentials ---------------------------------------------------
  const apiKey = Deno.env.get("MODEL_API_KEY");
  if (!apiKey) {
    return fail("NOT_CONFIGURED", "The model key is not set on the server.");
  }
  // Any OpenAI-compatible endpoint works. Gemini uses its compatibility layer
  // at /v1beta/openai/, which takes a standard Bearer token.
  const baseUrl = (Deno.env.get("MODEL_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const primary = Deno.env.get("MODEL_NAME") ?? "gpt-4o-mini";
  const secondary = Deno.env.get("MODEL_NAME_FALLBACK");
  // Providers retire model names and shed load without warning, so try the
  // fallback before giving up on planning entirely.
  const models = [primary, secondary].filter((m): m is string => typeof m === "string" && m.trim().length > 0);

  // --- call the model ------------------------------------------------------
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: userPrompt(mode, assignment as Record<string, unknown>, body.signals),
    },
  ];

  let raw: string | null = null;
  let failure = "No model was configured.";
  for (const model of models) {
    const result = await callModel(baseUrl, apiKey, model, messages);
    if (result.content) {
      raw = result.content;
      failure = "";
      break;
    }
    failure = result.failure;
  }

  if (!raw) return fail("MODEL_UNAVAILABLE", failure);

  // --- validate ------------------------------------------------------------
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail("INVALID_MODEL_OUTPUT", "The model's answer was not valid JSON.");
  }

  const estimate = validate(parsed);
  if (!estimate) {
    return fail("INVALID_MODEL_OUTPUT", "The model's answer did not match the required shape.");
  }

  return ok(estimate);
});
