import { cleanHeaderValue, looksLikeEmail } from "./email-deliverability";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

/** Sends a readable copy of an inbound reply to the team inbox. */
export async function forwardReply(reply: { from: string; subject: string; text: string }) {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const resendKey = process.env["RESEND_API_KEY"];
  const to = process.env["REPLY_FORWARD_TO"] ?? "quadri@verunda.com";
  const from = process.env["REPLY_FORWARD_FROM"] ?? "replies@verunda.com";
  if (!lovableKey || !resendKey || !looksLikeEmail(to) || !looksLikeEmail(from)) return;
  const replyTo = reply.from.trim();

  try {
    const response = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": resendKey,
      },
      body: JSON.stringify({
        from: `Verunda replies <${from}>`,
        to: [to],
        ...(looksLikeEmail(replyTo) ? { reply_to: replyTo } : {}),
        subject: cleanHeaderValue(`Reply from ${reply.from}: ${reply.subject}`).slice(0, 180),
        text: `${reply.from} replied:\n\n${reply.text}`.slice(0, 20000),
      }),
    });
    if (!response.ok) {
      console.error(`[reply-forward] failed [${response.status}]: ${await response.text()}`);
    }
  } catch (error) {
    console.error("[reply-forward] error", error);
  }
}
