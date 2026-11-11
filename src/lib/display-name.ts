// Display-name helpers shared by Settings and the shell top bar.
// Pure functions only — no Supabase calls here.

export const DISPLAY_NAME_MAX = 40;

/** Trim and cap a typed display name. Empty result means "use the fallback". */
export function normaliseDisplayName(raw: string): string {
  return raw.trim().slice(0, DISPLAY_NAME_MAX);
}

/** The name shown when no display name is set: the email local-part. */
export function emailLocalPart(email: string): string {
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

/** The name the app shows for the account. */
export function accountName(displayName: string | null | undefined, email: string): string {
  const name = displayName?.trim();
  return name ? name : emailLocalPart(email);
}

/**
 * Up to two initials for the avatar circle, from the display name when set,
 * otherwise from the email local-part. Always uppercase.
 */
export function avatarInitials(displayName: string | null | undefined, email: string): string {
  const name = displayName?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    const initials = parts.slice(0, 2).map((p) => p[0]!).join("");
    return initials.toUpperCase();
  }
  return emailLocalPart(email).slice(0, 1).toUpperCase() || "?";
}
