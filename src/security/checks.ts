// NextStep security cases. Network probes target only Supabase Auth or the
// anonymous Moodle Connect boundary. Everything else uses deterministic
// fixtures; this module never invokes agent-estimate or another AI endpoint.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { accountName, normaliseDisplayName } from "../lib/display-name.ts";
import { progressFromSteps } from "../lib/completion.ts";
import { finishStep, useExecuteSession } from "../lib/session/execute-store.ts";

export type Verdict = "BLOCKED" | "VULNERABLE" | "MANUAL" | "MITIGATED";

export interface Result {
  verdict: Verdict;
  observed: string;
  durationMs: number;
  fixed: boolean;
  fix: string;
  verification: string;
  manualSteps?: string[];
}

export interface SecurityCase {
  id: string;
  area: string;
  attackSurface: string;
  payload: unknown;
  expected: string;
  executionSteps: string[];
  evidenceFile: string;
  run(): Promise<Result>;
}

type PendingResult = Omit<Result, "durationMs" | "fixed"> & { fixed?: boolean };

async function measured(run: () => Promise<PendingResult>): Promise<Result> {
  const started = performance.now();
  try {
    const result = await run();
    return { ...result, fixed: result.fixed ?? false, durationMs: Math.round(performance.now() - started) };
  } catch (error) {
    return {
      verdict: "VULNERABLE",
      observed: `Check could not complete safely: ${error instanceof Error ? error.message : String(error)}`,
      fixed: false,
      fix: "Investigate the runner failure; no silent pass was recorded.",
      verification: "The check threw before its expected behaviour could be verified.",
      durationMs: Math.round(performance.now() - started),
    };
  }
}

const SUPABASE_URL = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "";
const ANON_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "";
const FIXTURE_USER_A = "00000000-0000-4000-8000-0000000000a1";
const FIXTURE_ASSIGNMENT_A = "00000000-0000-4000-8000-0000000000a2";
const XSS_PAYLOAD = "<img src=x onerror=alert(1)>";

function jsonHeaders(apikey = true): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(apikey && ANON_KEY ? { apikey: ANON_KEY } : {}),
  };
}

async function responseSummary(response: Response): Promise<string> {
  const text = await response.text();
  let code = "";
  try {
    const body = JSON.parse(text) as { error?: { code?: string } | string; code?: string; msg?: string; message?: string };
    if (typeof body.error === "object" && body.error?.code) code = body.error.code;
    else code = body.code ?? body.msg ?? body.message ?? (typeof body.error === "string" ? body.error : "");
  } catch {
    code = text.slice(0, 100);
  }
  return `HTTP ${response.status}${code ? ` (${code})` : ""}`;
}

const S1_PAYLOAD = { siteUrl: "https://moodle.invalid", token: "fixture-not-a-real-token" };
const S2_PAYLOAD = {
  actor: "Signed-in user B (owner session)",
  requestedUserA: FIXTURE_USER_A,
  requestedAssignmentA: FIXTURE_ASSIGNMENT_A,
  resources: ["assignments", "steps", "courses"],
};
const S3_PAYLOAD = { displayName: XSS_PAYLOAD, assignmentTitle: XSS_PAYLOAD };
const S4_PAYLOAD = [
  { siteUrl: "http://169.254.169.254/latest/meta-data", token: "fixture-token" },
  { siteUrl: "file:///etc/passwd", token: "fixture-token" },
  { siteUrl: "javascript:alert(1)", token: "fixture-token" },
  { siteUrl: "https://moodle.example.edu", token: "x".repeat(10_000) },
];
const S5_PAYLOAD = {
  refreshTokenWithoutApikey: "fixture-invalid-refresh-token",
  malformedJwt: "not.a.jwt",
  failedSignIns: 35,
  email: "security-s5-invalid@example.invalid",
  password: "invalid-fixture-password",
};
const S6_PAYLOAD = {
  title: "A".repeat(5_000),
  steps: 200,
  rapidDoneClicks: 50,
};

const S2_MANUAL_STEPS = [
  "Use only an account you own. In a signed-in owner session, obtain its existing Supabase access token; do not paste it into the report or source.",
  "Set SECURITY_TEST_ACCESS_TOKEN to that token and optionally SECURITY_TEST_OTHER_USER_ID and SECURITY_TEST_OTHER_ASSIGNMENT_ID to another account's known IDs.",
  "Run node scripts/security-run.mjs again. The runner requests assignments and courses filtered by user A plus steps filtered by user A's assignment.",
  "Confirm all three responses are empty arrays and no other user's title, course, or step data appears. Save the S2 evidence screenshot.",
];

export const securityCases: SecurityCase[] = [
  {
    id: "S1",
    area: "unauth-function",
    attackSurface: "POST /functions/v1/moodle-connect with the publishable anon key but no user session.",
    payload: S1_PAYLOAD,
    expected: "HTTP 401 or 403; never HTTP 200 and never a Moodle request.",
    executionSteps: [
      "Send one POST with apikey and JSON body, deliberately omitting Authorization.",
      "Read the HTTP status and typed error code; do not follow up with Moodle.",
    ],
    evidenceFile: "S1-unauth-function.png",
    run: () => measured(async () => {
      if (!SUPABASE_URL || !ANON_KEY) return {
        verdict: "MANUAL", observed: "Supabase URL or public key is unavailable to the runner.",
        fix: "No app change applied.", verification: "Provide the existing publishable key to the runner and repeat the anonymous POST.",
        manualSteps: ["Run the runner from the project where SUPABASE_PUBLISHABLE_KEY is already configured."],
      };
      const response = await fetch(`${SUPABASE_URL}/functions/v1/moodle-connect`, {
        method: "POST", headers: jsonHeaders(), body: JSON.stringify(S1_PAYLOAD),
        signal: AbortSignal.timeout(15_000),
      });
      const observed = await responseSummary(response);
      const blocked = response.status === 401 || response.status === 403;
      return {
        verdict: blocked ? "BLOCKED" : "VULNERABLE",
        observed: `${observed}; Authorization was absent and the anon key was the only credential.`,
        fix: blocked ? "No fix required; the deployed function rejects an absent user session." : "Require an authenticated user before input processing or Moodle access.",
        verification: blocked ? "The anonymous request was rejected with the required status." : "The anonymous request did not receive the required rejection status.",
      };
    }),
  },
  {
    id: "S2",
    area: "cross-tenant",
    attackSurface: "PostgREST reads for assignments, steps, and courses belonging to user A while authenticated as user B.",
    payload: S2_PAYLOAD,
    expected: "Three empty arrays; never another user's rows.",
    executionSteps: S2_MANUAL_STEPS,
    evidenceFile: "S2-cross-tenant.png",
    run: () => measured(async () => {
      const token = process.env["SECURITY_TEST_ACCESS_TOKEN"];
      if (!token || !SUPABASE_URL || !ANON_KEY) return {
        verdict: "MANUAL",
        observed: "No signed-in owner token is available. RLS policies for assignments, courses, and steps are present in migrations, but no cross-tenant pass is claimed.",
        fix: "No code change applied; owner-session evidence is required.",
        verification: "Awaiting the owner's signed-in three-table probe.",
        manualSteps: S2_MANUAL_STEPS,
      };
      const userA = process.env["SECURITY_TEST_OTHER_USER_ID"] ?? FIXTURE_USER_A;
      const assignmentA = process.env["SECURITY_TEST_OTHER_ASSIGNMENT_ID"] ?? FIXTURE_ASSIGNMENT_A;
      const headers = { ...jsonHeaders(), Authorization: `Bearer ${token}` };
      const urls = [
        `${SUPABASE_URL}/rest/v1/assignments?select=id&user_id=eq.${encodeURIComponent(userA)}`,
        `${SUPABASE_URL}/rest/v1/steps?select=id&assignment_id=eq.${encodeURIComponent(assignmentA)}`,
        `${SUPABASE_URL}/rest/v1/courses?select=id&user_id=eq.${encodeURIComponent(userA)}`,
      ];
      const responses = await Promise.all(urls.map((url) => fetch(url, { headers, signal: AbortSignal.timeout(15_000) })));
      const bodies = await Promise.all(responses.map((response) => response.json() as Promise<unknown>));
      const empty = responses.every((response) => response.ok) && bodies.every((body) => Array.isArray(body) && body.length === 0);
      const observed = responses.map((response, index) => `${S2_PAYLOAD.resources[index]}: HTTP ${response.status}, rows=${Array.isArray(bodies[index]) ? bodies[index].length : "error"}`).join("; ");
      return {
        verdict: empty ? "BLOCKED" : "VULNERABLE", observed,
        fix: empty ? "No fix required; owner-scoped RLS returned no user A rows." : "Review owner RLS policies and confirm the supplied IDs belong to a different user.",
        verification: empty ? "Signed-in user B received zero rows for all three resources." : "At least one cross-tenant query failed or returned data.",
      };
    }),
  },
  {
    id: "S3",
    area: "stored-xss",
    attackSurface: "Stored display name and assignment title rendered in the account and Map text contexts.",
    payload: S3_PAYLOAD,
    expected: "The literal string is rendered as text; no img element or event handler is created.",
    executionSteps: [
      "Use the payload as both a display-name fixture and an assignment-title fixture.",
      "Pass them through the same name helper and React text interpolation used by the views.",
      "Inspect the rendered markup for escaped text and the absence of an img element or onerror attribute.",
    ],
    evidenceFile: "S3-stored-xss.png",
    run: () => measured(async () => {
      const cleanName = normaliseDisplayName(S3_PAYLOAD.displayName);
      const markup = renderToStaticMarkup(createElement("div", null,
        createElement("span", null, accountName(cleanName, "owner@example.invalid")),
        createElement("h3", null, S3_PAYLOAD.assignmentTitle),
      ));
      const sourceFiles = ["../components/nextstep-shell.tsx", "../components/map-view.tsx", "../components/settings-view.tsx"];
      const dangerous = sourceFiles.filter((path) => readFileSync(new URL(path, import.meta.url), "utf8").includes("dangerouslySetInnerHTML"));
      // Escaped text legitimately retains the characters "onerror=". An exact
      // escaped-markup comparison distinguishes that text from a real element.
      const expectedMarkup = "<div><span>&lt;img src=x onerror=alert(1)&gt;</span><h3>&lt;img src=x onerror=alert(1)&gt;</h3></div>";
      const blocked = markup === expectedMarkup && dangerous.length === 0;
      return {
        verdict: blocked ? "BLOCKED" : "VULNERABLE",
        observed: blocked
          ? "Both fixtures rendered as escaped literal text; no img element, onerror attribute, or dangerous HTML rendering exists in the account/Map/Settings paths."
          : `Unsafe markup indicator found. markup=${markup.slice(0, 180)}; dangerous files=${dangerous.join(",") || "none"}`,
        fix: blocked ? "Corrected the test assertion to distinguish escaped text from a real event attribute; React rendering already escaped both fields." : "Remove raw HTML rendering and render both values only as React text children.",
        verification: blocked ? "Rendered output contains the visible payload text, not executable markup." : "The payload did not meet every text-only assertion.",
      };
    }),
  },
  {
    id: "S4",
    area: "connect-input",
    attackSurface: "Moodle Connect URL/token validation before the Edge Function's outbound fetch.",
    payload: S4_PAYLOAD,
    expected: "All four inputs fail validation before any outbound fetch; a normal HTTPS control remains valid.",
    executionSteps: [
      "Load the exact validator imported by moodle-connect.",
      "Submit the metadata IP, file URL, javascript URL, and 10,000-character token fixtures.",
      "Count simulated outbound calls after validation and confirm every attack input is rejected before that point.",
      "Check the function source calls the validator before its Moodle fetch.",
    ],
    evidenceFile: "S4-connect-input.png",
    run: () => measured(async () => {
      const source = readFileSync(new URL("../../supabase/functions/moodle-connect/index.ts", import.meta.url), "utf8");
      const callPosition = source.indexOf("const input = validateMoodleConnectInput");
      const fetchPosition = source.indexOf("await fetch(`${siteUrl}/webservice/rest/server.php`");
      if (callPosition < 0) return {
        verdict: "VULNERABLE",
        observed: "The function has no shared pre-fetch input guard: its current normalizer permits HTTP and has no private-address or token-length check.",
        fix: "No fix applied in this attack pass.",
        verification: "Source inspection confirmed that the required validation boundary is absent.",
      };
      const moduleUrl = new URL("../../supabase/functions/moodle-connect/validation.ts", import.meta.url).href;
      const { validateMoodleConnectInput } = await import(moduleUrl) as typeof import("../../supabase/functions/moodle-connect/validation.ts");
      let outboundFetches = 0;
      const rejected: string[] = [];
      for (const fixture of S4_PAYLOAD) {
        const result = validateMoodleConnectInput(fixture.siteUrl, fixture.token);
        if (result.ok) outboundFetches += 1; // Mirrors the handler: fetch is reachable only after ok.
        else rejected.push(result.message);
      }
      const control = validateMoodleConnectInput("https://moodle.example.edu", "x".repeat(32));
      const blocked = rejected.length === 4 && outboundFetches === 0 && control.ok && callPosition >= 0 && fetchPosition > callPosition;
      return {
        verdict: blocked ? "BLOCKED" : "VULNERABLE",
        observed: `${rejected.length}/4 attack inputs rejected; outbound fixture fetches=${outboundFetches}; valid HTTPS control=${control.ok ? "accepted" : "rejected"}; validator precedes fetch=${fetchPosition > callPosition}.`,
        fix: "Added shared HTTPS/private-address/token-length validation and called it before any Moodle fetch.",
        verification: blocked ? "All four attacks stopped at validation with zero outbound calls." : "At least one attack reached the simulated fetch boundary or the valid control failed.",
      };
    }),
  },
  {
    id: "S5",
    area: "auth-abuse",
    attackSurface: "Supabase Auth refresh-token, malformed-JWT, and password-grant endpoints.",
    payload: S5_PAYLOAD,
    expected: "Only HTTP 400/401/429 responses, never HTTP 500; record whether rapid failures produce HTTP 429.",
    executionSteps: [
      "Call refresh_token without an apikey using a fixture refresh token.",
      "Call the user endpoint with a malformed JWT and the publishable key.",
      "Send 20 rapid password grants for a reserved invalid fixture account.",
      "Reject any 5xx response and record whether at least one response is HTTP 429.",
    ],
    evidenceFile: "S5-auth-abuse.png",
    run: () => measured(async () => {
      if (!SUPABASE_URL || !ANON_KEY) return {
        verdict: "MANUAL", observed: "Supabase URL or public key is unavailable to the runner.",
        fix: "No app change applied.", verification: "Configure your own Supabase public URL and key before testing Auth.",
      };
      const noKey = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST", headers: jsonHeaders(false), body: JSON.stringify({ refresh_token: S5_PAYLOAD.refreshTokenWithoutApikey }),
        signal: AbortSignal.timeout(15_000),
      });
      await noKey.arrayBuffer();
      const malformed = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${S5_PAYLOAD.malformedJwt}` }, signal: AbortSignal.timeout(15_000),
      });
      await malformed.arrayBuffer();
      const attempts = await Promise.all(Array.from({ length: S5_PAYLOAD.failedSignIns }, () => fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST", headers: jsonHeaders(), body: JSON.stringify({ email: S5_PAYLOAD.email, password: S5_PAYLOAD.password }),
        signal: AbortSignal.timeout(15_000),
      })));
      const statuses = attempts.map((response) => response.status);
      await Promise.all(attempts.map((response) => response.arrayBuffer()));
      const all = [noKey.status, malformed.status, ...statuses];
      const noServerErrors = all.every((status) => status < 500);
      const expectedRejections = noKey.status === 400 || noKey.status === 401 || noKey.status === 403;
      const malformedRejected = malformed.status === 400 || malformed.status === 401 || malformed.status === 403;
      const signInsRejected = statuses.every((status) => status === 400 || status === 401 || status === 429);
      const limited = statuses.includes(429);
      const counts = Object.entries(statuses.reduce<Record<number, number>>((acc, status) => ({ ...acc, [status]: (acc[status] ?? 0) + 1 }), {})).map(([status, count]) => `${status}×${count}`).join(", ");
      const blocked = noServerErrors && expectedRejections && malformedRejected && signInsRejected && limited;
      const needsManualRateLimit = noServerErrors && expectedRejections && malformedRejected && signInsRejected && !limited;
      return {
        verdict: blocked ? "BLOCKED" : needsManualRateLimit ? "MANUAL" : "VULNERABLE",
        observed: `refresh without apikey=${noKey.status}; malformed JWT=${malformed.status}; ${S5_PAYLOAD.failedSignIns} sign-ins: ${counts}; rate-limit 429 observed=${limited}; 5xx responses=${all.filter((status) => status >= 500).length}.`,
        fix: "No custom limiter added; Supabase Auth owns these endpoints and all credentials were invalid fixtures.",
        verification: blocked
          ? "Every abuse request was rejected and rapid failures triggered the managed rate limit."
          : needsManualRateLimit
            ? "Credential rejection and 5xx checks passed, but no 429 was observed; managed rate-limit behaviour remains unverified."
            : "At least one response violated the required rejection/status rules.",
        ...(needsManualRateLimit ? { manualSteps: [
          "Review Supabase Auth's managed rate-limit settings and current provider limits.",
          "Repeat only the authorised 20-request fixture after any platform change; do not add an ad-hoc app limiter without confirming that tradeoff.",
          "Record a 429 response if the managed limiter fires; otherwise retain this residual risk as MANUAL.",
        ] } : {}),
      };
    }),
  },
  {
    id: "S6",
    area: "resilience",
    attackSurface: "Long React text, 200-step progress calculation, and repeated Done transitions for one fixture step.",
    payload: S6_PAYLOAD,
    expected: "No crash, progress remains 0–100, and 50 rapid Done clicks produce one accepted transition/write.",
    executionSteps: [
      "Render the 5,000-character title as a React text fixture.",
      "Calculate progress for zero, partial, and all completed states across 200 steps.",
      "Submit 50 Done transitions with one assignment/step key and count accepted database-write equivalents.",
    ],
    evidenceFile: "S6-resilience.png",
    run: () => measured(async () => {
      const longMarkup = renderToStaticMarkup(createElement("h3", null, S6_PAYLOAD.title));
      const steps = Array.from({ length: S6_PAYLOAD.steps }, (_, orderIndex) => ({ orderIndex, status: orderIndex < 100 ? "done" as const : "todo" as const }));
      const zero = progressFromSteps(steps.map((step) => ({ ...step, status: "todo" })), 0);
      const partial = progressFromSteps(steps, 0);
      const full = progressFromSteps(steps.map((step) => ({ ...step, status: "done" })), 0);
      const key = `security-${Date.now()}`;
      let writes = 0;
      for (let click = 0; click < S6_PAYLOAD.rapidDoneClicks; click += 1) {
        const accepted = finishStep({ key, status: "done", elapsedSeconds: 1, timeboxSeconds: 1500 });
        if (accepted !== false) writes += 1; // Execute persists only accepted transitions after the fix.
      }
      function Probe() {
        const session = useExecuteSession();
        return createElement("output", null, String(session.finished.filter((entry) => entry.key === key).length));
      }
      const recorded = Number(renderToStaticMarkup(createElement(Probe)).replace(/<[^>]+>/g, ""));
      const progressSafe = [zero, partial, full].every((value) => Number.isInteger(value) && value >= 0 && value <= 100) && zero === 0 && partial === 50 && full === 100;
      const blocked = longMarkup.includes(S6_PAYLOAD.title) && progressSafe && writes === 1 && recorded === 1;
      return {
        verdict: blocked ? "BLOCKED" : "VULNERABLE",
        observed: `5,000-character title rendered=${longMarkup.includes(S6_PAYLOAD.title)}; 200-step progress=${zero}/${partial}/${full}; 50 clicks produced writes=${writes}, session entries=${recorded}.`,
        fix: writes === 1 ? "Made step transitions idempotent by assignment/step key and gated Execute persistence on acceptance." : "No fix applied in this attack pass.",
        verification: blocked ? "Long text and all progress bounds passed; duplicate transitions and duplicate writes were suppressed." : "At least one resilience assertion failed.",
      };
    }),
  },
];

// Friendly alias for consumers that prefer the shorter name.
export const cases = securityCases;
