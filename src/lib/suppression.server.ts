import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * The do-not-email list.
 *
 * Anyone who unsubscribes, bounces or reports a message is recorded here once
 * and is then skipped by every future send, including follow-ups. Repeatedly
 * emailing addresses that bounce or complain is the fastest way to lose the
 * inbox, so this is checked immediately before each individual email goes out.
 */

/**
 * Where the links inside emails point.
 *
 * Mailbox providers compare the sending domain with the domains linked in the
 * message, so every link sits on the sending brand's own domain. The default
 * is the connected link domain; EMAIL_LINK_BASE can override it.
 */
export const APP_URL = (process.env["EMAIL_LINK_BASE"] || "https://link.verunda.com").replace(
  /\/+$/,
  "",
);

// A hardcoded fallback here would let anyone compute a valid unsubscribe
// token for any address (the source is not secret) and mass-suppress the
// list. Without a configured secret, fall back to one generated fresh per
// process instead: links signed before a restart stop verifying, which is
// safer than a fallback an outsider can also compute.
let generatedSecret: string | null = null;
function secret(): string {
  const configured = process.env["UNSUBSCRIBE_SECRET"] ?? process.env["RESEND_WEBHOOK_SECRET"];
  if (configured) return configured;
  if (!generatedSecret) {
    console.error(
      "[suppression] UNSUBSCRIBE_SECRET is not set — using a random per-process secret. " +
        "Set UNSUBSCRIBE_SECRET (or RESEND_WEBHOOK_SECRET) in project secrets so unsubscribe links keep working across restarts.",
    );
    generatedSecret = randomBytes(32).toString("hex");
  }
  return generatedSecret;
}

export function unsubscribeToken(email: string): string {
  return createHmac("sha256", secret())
    .update(email.trim().toLowerCase())
    .digest("hex")
    .slice(0, 32);
}

export function checkUnsubscribeToken(email: string, token: string): boolean {
  const expected = Buffer.from(unsubscribeToken(email));
  const given = Buffer.from(String(token ?? ""));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function unsubscribeUrl(email: string): string {
  const address = email.trim().toLowerCase();
  return `${APP_URL}/api/public/unsubscribe?e=${encodeURIComponent(address)}&t=${unsubscribeToken(address)}`;
}

export async function isSuppressed(email: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("email_suppressions")
    .select("email")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  return Boolean(data);
}

export async function suppress(email: string, reason: string): Promise<void> {
  const address = email.trim().toLowerCase();
  if (!address) return;
  await supabaseAdmin
    .from("email_suppressions")
    .upsert({ email: address, reason }, { onConflict: "email" });
}
