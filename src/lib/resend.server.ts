import { inboxSubject, plainHtmlBody, renderTemplate, type MergeContext } from "./merge";
import { isSuppressed, unsubscribeUrl } from "./suppression.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

export type SendOneInput = {
  fromName: string;
  fromEmail: string;
  /** Any address, on any provider (Gmail included). Left out when blank or malformed. */
  replyTo?: string | null;
  to: string;
  subject: string;
  body: string;
  context: MergeContext;
};

export type SendOneResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string; suppressed?: boolean };

/** Cheap sanity check so a malformed address is never handed to the provider. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@,;:<>()"[\]]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+$/i.test(value.trim());
}

/** Sends one personalised email through the connected Resend account. */
export async function sendOneEmail(input: SendOneInput): Promise<SendOneResult> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const resendKey = process.env["RESEND_API_KEY"];
  if (!lovableKey || !resendKey) {
    return { ok: false, error: "Email sending is not connected yet." };
  }

  const to = input.to.trim().toLowerCase();
  if (!looksLikeEmail(to)) {
    return { ok: false, error: "That address is not a usable email address.", suppressed: true };
  }
  if (await isSuppressed(to)) {
    return {
      ok: false,
      error: "Skipped: this address unsubscribed, bounced or reported a message before.",
      suppressed: true,
    };
  }

  const subject = inboxSubject(renderTemplate(input.subject, input.context));
  const optOut = unsubscribeUrl(to);
  const message = renderTemplate(input.body, input.context);
  // Plain text has nowhere to hide a link, so it keeps the address; the HTML
  // twin shows a single tidy "unsubscribe" word instead.
  const text = `${message}\n\nIf you would rather not hear from me, unsubscribe here: ${optOut}`;

  // A reply address on another provider is fine for deliverability, but the opt-out
  // mailto stays on the signing domain so the authenticated domain always matches.
  const replyTo = (input.replyTo ?? "").trim();
  const usableReply = replyTo && looksLikeEmail(replyTo) ? replyTo : null;

  try {
    const response = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": resendKey,
      },
      body: JSON.stringify({
        from: input.fromName ? `${input.fromName} <${input.fromEmail}>` : input.fromEmail,
        to: [to],
        subject,
        text,
        // The HTML twin looks identical but lets the provider report opens/clicks.
        html: plainHtmlBody(text),
        ...(usableReply ? { reply_to: usableReply } : {}),
        headers: {
          "X-Entity-Ref-ID": crypto.randomUUID(),
          // Spam filters expect bulk mail to offer a machine-readable opt-out.
          "List-Unsubscribe": `<${optOut}>, <mailto:${input.fromEmail}?subject=unsubscribe>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
    });


    const bodyText = await response.text();
    if (!response.ok) {
      console.error(`[resend] send failed [${response.status}]: ${bodyText}`);
      return { ok: false, error: `${response.status}: ${bodyText.slice(0, 400)}` };
    }
    let id: string | null = null;
    try {
      id = (JSON.parse(bodyText) as { id?: string }).id ?? null;
    } catch {
      id = null;
    }
    return { ok: true, id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown send error" };
  }
}
