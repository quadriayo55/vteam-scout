import { inboxSubject, plainHtmlBody, renderTemplate, type MergeContext } from "./merge";
import { APP_URL, isSuppressed, suppress, unsubscribeUrl } from "./suppression.server";
import { domainAcceptsMail } from "./mx.server";
import { cleanHeaderValue, looksLikeEmail, validateRenderedEmail } from "./email-deliverability";

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
  { ok: true; id: string | null } | { ok: false; error: string; suppressed?: boolean };

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
  // A domain with no mail server always bounces, and bounces are what pushes the
  // rest of the list into spam, so it is skipped and remembered instead.
  if (!(await domainAcceptsMail(to))) {
    await suppress(to, "undeliverable_domain");
    return {
      ok: false,
      error: "Skipped: that domain cannot receive email.",
      suppressed: true,
    };
  }

  const subject = inboxSubject(renderTemplate(input.subject, input.context));
  const optOut = unsubscribeUrl(to);
  const message = renderTemplate(input.body, input.context);
  const validationError = validateRenderedEmail({
    fromEmail: input.fromEmail,
    subject,
    body: message,
    linkBase: APP_URL,
  });
  if (validationError) return { ok: false, error: validationError, suppressed: true };
  // Plain text has nowhere to hide a link, so it keeps the address; the HTML
  // twin shows a single tidy "unsubscribe" word instead.
  const text = `${message}\n\nIf you would rather not hear from me, unsubscribe here: ${optOut}`;

  // A reply address on another provider is fine for deliverability, but the opt-out
  // mailto stays on the signing domain so the authenticated domain always matches.
  const replyTo = (input.replyTo ?? "").trim();
  const usableReply = replyTo && looksLikeEmail(replyTo) ? replyTo : null;
  const fromName = cleanHeaderValue(input.fromName, "Verunda");
  const fromEmail = input.fromEmail.trim().toLowerCase();

  try {
    const response = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": resendKey,
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [to],
        subject,
        text,
        // Keep a simple HTML twin alongside the plain-text version.
        html: plainHtmlBody(message, optOut),
        ...(usableReply ? { reply_to: usableReply } : {}),
        headers: {
          // Gmail and Yahoo expect bulk mail to offer a machine-readable opt-out.
          "List-Unsubscribe": `<${optOut}>`,
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
