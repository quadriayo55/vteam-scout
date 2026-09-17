import { createFileRoute } from "@tanstack/react-router";

/**
 * One-click unsubscribe, reached from the List-Unsubscribe header and from the
 * link at the foot of every email. Mail providers press this automatically on
 * the recipient's behalf, so it has to work without a sign-in.
 */

function page(message: string) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title><body style="font-family:Arial,Helvetica,sans-serif;background:#0b0d10;color:#e9edf2;display:grid;place-items:center;min-height:100vh;margin:0"><div style="max-width:28rem;padding:2rem;text-align:center"><h1 style="font-size:1.25rem">${message}</h1><p style="opacity:.7;font-size:.9rem">You can close this page.</p></div></body>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

async function handle(request: Request) {
  const url = new URL(request.url);
  let email = url.searchParams.get("e") ?? "";
  let token = url.searchParams.get("t") ?? "";

  if (request.method === "POST" && !email) {
    const body = await request.text();
    const form = new URLSearchParams(body);
    email = form.get("e") ?? "";
    token = form.get("t") ?? "";
  }

  const { checkUnsubscribeToken, suppress } = await import("@/lib/suppression.server");
  if (!email || !checkUnsubscribeToken(email, token)) {
    return page("That unsubscribe link is not valid.");
  }
  await suppress(email, "unsubscribed");
  return page("You have been unsubscribed. You will not hear from us again.");
}

export const Route = createFileRoute("/api/public/unsubscribe")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
