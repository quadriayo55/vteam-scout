import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Delivery, open, click, bounce, complaint and reply notifications from Resend.
 * Every notification is verified and recorded once, so repeated deliveries of
 * the same notification can never inflate the numbers.
 */

type ResendEvent = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    from?: string;
    subject?: string;
    text?: string;
    html?: string;
    headers?: Record<string, string> | { name: string; value: string }[];
  };
};

function verifySvix(secret: string, id: string, timestamp: string, body: string, header: string) {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  const expectedBuf = Buffer.from(expected);
  return header
    .split(" ")
    .map((part) => part.split(",")[1] ?? "")
    .filter(Boolean)
    .some((candidate) => {
      const buf = Buffer.from(candidate);
      return buf.length === expectedBuf.length && timingSafeEqual(buf, expectedBuf);
    });
}

function firstAddress(value: string[] | string | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const match = /<([^>]+)>/.exec(raw);
  return (match?.[1] ?? raw).trim().toLowerCase();
}

async function pauseRiskyOutreach(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  sendId: string,
  eventType: string,
) {
  const isComplaint = eventType.endsWith("complained");
  const [{ count: sent }, { count: bounced }] = await Promise.all([
    supabaseAdmin
      .from("bulk_send_recipients")
      .select("id", { count: "exact", head: true })
      .eq("send_id", sendId)
      .eq("status", "sent"),
    supabaseAdmin
      .from("bulk_send_recipients")
      .select("id", { count: "exact", head: true })
      .eq("send_id", sendId)
      .not("bounced_at", "is", null),
  ]);
  const sentCount = sent ?? 0;
  const bounceCount = bounced ?? 0;
  const excessiveBounces = sentCount >= 20 && bounceCount >= 3 && bounceCount / sentCount >= 0.05;
  if (!isComplaint && !excessiveBounces) return;

  const stoppedAt = new Date().toISOString();
  await Promise.all([
    supabaseAdmin
      .from("bulk_sends")
      .update({ status: "paused", updated_at: stoppedAt })
      .eq("id", sendId)
      .eq("status", "sending"),
    supabaseAdmin
      .from("followup_sequences")
      .update({ status: "paused", updated_at: stoppedAt })
      .eq("send_id", sendId)
      .eq("status", "active"),
  ]);
  console.warn(
    `[deliverability] paused outreach ${sendId}: ${isComplaint ? "spam complaint" : `${bounceCount}/${sentCount} bounced`}`,
  );
}

export const Route = createFileRoute("/api/public/resend-events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["RESEND_WEBHOOK_SECRET"];
        if (!secret) return new Response("Not configured", { status: 500 });

        const body = await request.text();
        const id = request.headers.get("svix-id") ?? "";
        const timestamp = request.headers.get("svix-timestamp") ?? "";
        const signature = request.headers.get("svix-signature") ?? "";
        if (!id || !timestamp || !signature) {
          return new Response("Missing signature", { status: 401 });
        }
        const age = Math.abs(Date.now() / 1000 - Number(timestamp));
        if (!Number.isFinite(age) || age > 60 * 10) {
          return new Response("Stale signature", { status: 401 });
        }
        if (!verifySvix(secret, id, timestamp, body, signature)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let event: ResendEvent;
        try {
          event = JSON.parse(body) as ResendEvent;
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        const type = String(event.type ?? "");
        const providerId = event.data?.email_id ?? null;
        const occurredAt = event.created_at ?? new Date().toISOString();
        const isInbound = type.includes("received") || type.includes("inbound");
        const address = isInbound ? firstAddress(event.data?.from) : firstAddress(event.data?.to);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Find the recipient this notification belongs to.
        let recipient: {
          id: string;
          send_id: string;
          user_id: string;
          email: string;
          open_count: number;
          click_count: number;
          first_open_at: string | null;
          first_click_at: string | null;
        } | null = null;

        const columns =
          "id, send_id, user_id, email, open_count, click_count, first_open_at, first_click_at";

        if (providerId && !isInbound) {
          const { data } = await supabaseAdmin
            .from("bulk_send_recipients")
            .select(columns)
            .eq("provider_id", providerId)
            .maybeSingle();
          recipient = data ?? null;
        }
        if (!recipient && address) {
          const { data } = await supabaseAdmin
            .from("bulk_send_recipients")
            .select(columns)
            .eq("email", address)
            .order("sent_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          recipient = data ?? null;
        }

        // Recorded first: a duplicate notification stops right here.
        const { error: logError } = await supabaseAdmin.from("email_events").insert({
          event_key: id,
          event_type: type,
          provider_id: providerId,
          recipient_id: recipient?.id ?? null,
          send_id: recipient?.send_id ?? null,
          user_id: recipient?.user_id ?? null,
          email: address,
          payload: JSON.parse(JSON.stringify(event)),
          occurred_at: occurredAt,
        });
        if (logError) {
          if (logError.code === "23505" || /duplicate/i.test(logError.message)) {
            return new Response("ok");
          }
          console.error(`[resend-events] log failed: ${logError.message}`);
          return new Response("Log failed", { status: 500 });
        }
        if (!recipient) return new Response("ok");

        type RecipientPatch = Record<string, string | number | null>;
        const patch: RecipientPatch = {};
        if (type.endsWith("delivered")) patch["delivered_at"] = occurredAt;
        else if (type.endsWith("bounced")) patch["bounced_at"] = occurredAt;
        else if (type.endsWith("complained")) patch["complained_at"] = occurredAt;
        else if (type.endsWith("opened")) {
          patch["open_count"] = (recipient.open_count ?? 0) + 1;
          patch["last_open_at"] = occurredAt;
          if (!recipient.first_open_at) patch["first_open_at"] = occurredAt;
        } else if (type.endsWith("clicked")) {
          patch["click_count"] = (recipient.click_count ?? 0) + 1;
          patch["last_click_at"] = occurredAt;
          if (!recipient.first_click_at) patch["first_click_at"] = occurredAt;
        } else if (isInbound) {
          patch["replied_at"] = occurredAt;
        }

        // A bounce or a spam report means never email this address again.
        if (address && (type.endsWith("bounced") || type.endsWith("complained"))) {
          const { suppress } = await import("@/lib/suppression.server");
          await suppress(address, type.endsWith("bounced") ? "bounced" : "complained");
        }

        if (Object.keys(patch).length > 0) {
          await supabaseAdmin
            .from("bulk_send_recipients")
            .update(patch as never)
            .eq("id", recipient.id);
        }

        if (type.endsWith("bounced") || type.endsWith("complained")) {
          await pauseRiskyOutreach(supabaseAdmin, recipient.send_id, type);
        }

        // A reply is worth seeing straight away, so forward a readable copy.
        if (isInbound) {
          const { forwardReply } = await import("@/lib/reply-forward.server");
          await forwardReply({
            from: address ?? "unknown sender",
            subject: event.data?.subject ?? "(no subject)",
            text: event.data?.text ?? "",
          });
        }

        return new Response("ok");
      },
    },
  },
});
