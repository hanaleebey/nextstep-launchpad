// Shared, non-secret report metadata. The route still checks the authenticated
// user; this constant is an authorization target, not a client-side role flag.
export const SECURITY_OWNER_EMAIL = "hanaleebey+student1@gmail.com";

export function isSecurityOwner(email: string): boolean {
  return email.trim().toLowerCase() === SECURITY_OWNER_EMAIL.toLowerCase();
}

export const SECURITY_METHOD = [
  "Enumerate the attack surface and its intended security boundary.",
  "Prepare a deterministic demo payload or fixture; never use a live LMS or AI endpoint.",
  "Execute the attack and record the exact response without exposing credentials.",
  "Compare the observed response with the expected BLOCKED behaviour.",
  "Apply the smallest relevant fix when the result is VULNERABLE.",
  "Re-run the same attack and record BLOCKED evidence before marking it fixed.",
] as const;

export const SECURITY_SCOPE = [
  "React 19 + TypeScript client, Supabase Auth, Postgres row-level security, and deployed Edge Functions.",
  "Anonymous network probes and deterministic fixtures only; no live Moodle, assignment data mutation, second user, or AI endpoint is required.",
  "The owner account is the only authorised tester. Signed-in probes run only when an owner-provided session token is already present in the environment.",
] as const;

export const SECURITY_RESIDUAL_RISKS = [
  "A signed-in cross-tenant probe cannot be minted by this sandbox for the user-managed Supabase project; S2 stays MANUAL until the owner runs it with an existing session.",
  "Supabase Auth rate limits are managed by Supabase. S5 records whether HTTP 429 was actually observed and never claims a limiter fired when it did not.",
  "Moodle Connect rejects non-HTTPS, local, private and link-local literal destinations before fetching. DNS-rebinding defence still depends on platform egress controls.",
  "Fixture tests establish rendering and transition safety, not every browser, operating-system, timer or layout combination.",
] as const;

export const EVIDENCE_FILES: Record<string, string> = {
  S1: "S1-unauth-function.png",
  S2: "S2-cross-tenant.png",
  S3: "S3-stored-xss.png",
  S4: "S4-connect-input.png",
  S5: "S5-auth-abuse.png",
  S6: "S6-resilience.png",
};
