// Pure input boundary for moodle-connect. No network or Deno APIs here, so the
// security runner can exercise the exact same validation with fixtures.
export const MOODLE_TOKEN_MAX = 512;

export type MoodleInputResult =
  | { ok: true; siteUrl: string; token: string }
  | { ok: false; message: string };

function privateIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const numbers = parts.map(Number);
  if (numbers.some((part) => part < 0 || part > 255)) return false;
  const [a = 0, b = 0] = numbers;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168);
}

/** Reject destinations that could address the host, local network or metadata service. */
function localOrPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host.endsWith(".localhost") ||
    host.endsWith(".local") || host.endsWith(".internal") ||
    host === "::1" || host === "::" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd") ||
    privateIpv4(host);
}

/** Validate and normalise both fields before the caller's first outbound fetch. */
export function validateMoodleConnectInput(rawSiteUrl: unknown, rawToken: unknown): MoodleInputResult {
  if (typeof rawSiteUrl !== "string") return { ok: false, message: "siteUrl must be a valid HTTPS URL." };
  let url: URL;
  try {
    url = new URL(rawSiteUrl.trim());
  } catch {
    return { ok: false, message: "siteUrl must be a valid HTTPS URL." };
  }
  if (url.protocol !== "https:" || url.username || url.password || localOrPrivateHost(url.hostname)) {
    return { ok: false, message: "Use a public HTTPS Moodle URL without credentials or local/private addresses." };
  }
  const token = typeof rawToken === "string" ? rawToken.trim() : "";
  if (!token) return { ok: false, message: "token is required." };
  if (token.length > MOODLE_TOKEN_MAX) return { ok: false, message: `token must be ${MOODLE_TOKEN_MAX} characters or fewer.` };
  return { ok: true, siteUrl: `${url.origin}${url.pathname}`.replace(/\/+$/, ""), token };
}
