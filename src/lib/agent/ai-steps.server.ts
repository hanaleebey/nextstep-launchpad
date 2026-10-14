// Server-only: one streamed call to the Lovable AI Gateway (Responses API).
// Returns parsed JSON or throws a short, safe error message.
import { AI_STEPS_SCHEMA, buildPrompt, type AiStepsInput } from "./ai-steps";

const MODEL = "openai/gpt-6-astra";

export async function callAiSteps(input: AiStepsInput): Promise<unknown> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: MODEL,
      input: buildPrompt(input),
      stream: true,
      store: false,
      reasoning: { effort: "low" },
      text: { format: { type: "json_schema", name: "steps", strict: true, schema: AI_STEPS_SCHEMA } },
    }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    console.error("AI gateway error", res.status, body.slice(0, 500));
    if (res.status === 402) throw new Error("AI credits are used up");
    if (res.status === 429) throw new Error("AI is busy right now");
    throw new Error(`AI request failed (${res.status})`);
  }

  // Read the SSE stream and collect the text deltas.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";
    for (const frame of frames) {
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const ev = JSON.parse(data) as { type?: string; delta?: string; response?: { error?: { message?: string } } };
          if (ev.type === "response.output_text.delta" && ev.delta) text += ev.delta;
          if (ev.type === "response.failed" || ev.type === "error") throw new Error("AI could not finish");
          if (ev.type === "response.refusal.delta") throw new Error("AI declined this request");
        } catch (e) {
          if (e instanceof Error && e.message.startsWith("AI")) throw e;
        }
      }
    }
  }
  if (!text) throw new Error("AI returned nothing");
  return JSON.parse(text);
}
