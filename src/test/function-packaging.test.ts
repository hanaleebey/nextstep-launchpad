// @vitest-environment node
// Execute existing Deno handlers with fake Auth/env in memory. No HTTP request
// leaves this process and no model/Moodle endpoint is ever called.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type Handler = (request: Request) => Promise<Response>;
function loadHandler(name: string): Handler {
  let handler: Handler | undefined;
  const source = readFileSync(`supabase/functions/${name}/index.ts`, "utf8")
    .replace(/^import .*;\s*$/gm, "");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  runInNewContext(javascript, {
    exports: {}, Response, Request, URL, URLSearchParams, AbortSignal,
    TextEncoder, TextDecoder, Uint8Array, crypto, btoa, atob, setTimeout, console,
    Deno: { env: { get: (key: string) => key === "SUPABASE_URL" ? "https://supabase.example" : key === "SUPABASE_ANON_KEY" ? "fixture-public-key" : undefined },
      serve: (callback: Handler) => { handler = callback; } },
    createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "fixture-user" } } }) } }),
    validateMoodleConnectInput: () => ({ ok: true, siteUrl: "https://moodle.example.edu", token: "fixture-token" }),
    fetch: () => { throw new Error("Network use is forbidden in this fixture test"); },
  });
  if (!handler) throw new Error(`No handler registered by ${name}`);
  return handler;
}

describe("existing function packaging contracts without credentials", () => {
  it.each(["agent-estimate", "moodle-connect", "moodle-sync"])("%s rejects an anonymous caller with CORS", async (name) => {
    const response = await loadHandler(name)(new Request("https://function.example", { method: "POST" }));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
  it("missing MODEL_API_KEY produces the typed HTTP-200 model failure", async () => {
    const response = await loadHandler("agent-estimate")(new Request("https://function.example", {
      method: "POST", headers: { Authorization: "Bearer fixture-session" },
      body: JSON.stringify({ mode: "plan", assignment: { title: "Read memory sections 1–3", type: "read" } }),
    }));
    expect(response.status).toBe(200);
    expect((await response.json()).error.code).toBe("NOT_CONFIGURED");
  });
  it.each(["moodle-connect", "moodle-sync"])("%s reports a missing encryption key before Moodle access", async (name) => {
    const response = await loadHandler(name)(new Request("https://function.example", {
      method: "POST", headers: { Authorization: "Bearer fixture-session" }, body: "{}",
    }));
    expect(response.status).toBe(200);
    expect((await response.json()).error.code).toBe("NOT_CONFIGURED");
  });
});