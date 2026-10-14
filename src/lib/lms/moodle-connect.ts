// The only place the app reaches the `moodle-connect` Edge Function (deployed
// by the developer in their own Supabase project). The function validates the
// token with Moodle server-side, encrypts it and saves the lms_connections row,
// so the browser never talks to Moodle and the token is never stored here.
import { supabase } from "@/integrations/supabase/client";

export type MoodleConnectResult =
  | { ok: true; siteName: string; username: string; userId: string }
  | { ok: false; code: string; message: string };

export async function connectMoodle(siteUrl: string, token: string): Promise<MoodleConnectResult> {
  const { data, error } = await supabase.functions.invoke("moodle-connect", { body: { siteUrl, token } });
  if (error) {
    // Non-2xx replies still carry our { ok:false, error:{code,message} } body.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (error as any).context as Response | undefined;
    try {
      const body = ctx ? await ctx.json() : null;
      if (body?.error?.message) return { ok: false, code: body.error.code ?? "ERROR", message: body.error.message };
    } catch { /* body wasn't JSON — fall through */ }
    return { ok: false, code: "UNREACHABLE", message: "Couldn't reach the connection service. Try again in a moment." };
  }
  if (data?.ok) return { ok: true, siteName: data.siteName, username: data.username, userId: data.userId };
  return { ok: false, code: data?.error?.code ?? "ERROR", message: data?.error?.message ?? "Unexpected reply from the connection service." };
}
