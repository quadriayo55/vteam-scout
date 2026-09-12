import { inboxSubject, plainHtmlBody, renderTemplate, type MergeContext } from "./merge";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

export type SendOneInput = {
  fromName: string;
  fromEmail: string;
  replyTo: string;
  to: string;
  subject: string;
  body: string;
  context: MergeContext;
};

export type SendOneResult = { ok: true; id: string | null } | { ok: false; error: string };

/** Sends one personalised email through the connected Resend account. */
export async function sendOneEmail(input: SendOneInput): Promise<SendOneResult> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const resendKey = process.env["RESEND_API_KEY"];
  if (!lovableKey || !resendKey) {
    return { ok: false, error: "Email sending is not connected yet." };
  }

  const subject = inboxSubject(renderTemplate(input.subject, input.context));
  const text = renderTemplate(input.body, input.context);

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
        to: [input.to],
        subject,
        text,
        // The HTML twin looks identical but lets the provider report opens/clicks.
        html: plainHtmlBody(text),
        reply_to: input.replyTo,
        headers: { "X-Entity-Ref-ID": crypto.randomUUID() },
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
