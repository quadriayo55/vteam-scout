import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";


export type BatchResult = {
  sent: number;
  failed: number;
  remaining: number;
  capReached: boolean;
  status: string;
  errors: string[];
};

function personalize(template: string, name: string | null) {
  return (template ?? "").replaceAll("{name}", name?.trim() || "there");
}


/** Sends the next batch of a bulk send. The client calls this repeatedly, pacing with the send's gap. */
export const sendBulkBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sendId: string }) => {
    if (!input?.sendId) throw new Error("sendId is required");
    return { sendId: input.sendId };
  })
  .handler(async ({ data, context }): Promise<BatchResult> => {
    const { supabase, userId } = context;

    const lovableKey = process.env["LOVABLE_API_KEY"];
    const resendKey = process.env["RESEND_API_KEY"];
    if (!lovableKey || !resendKey) {
      throw new Error("Email sending is not connected yet.");
    }

    const { data: send, error: sendError } = await supabase
      .from("bulk_sends")
      .select("*")
      .eq("id", data.sendId)
      .single();
    if (sendError || !send) throw new Error("This send could not be found.");
    if (send.user_id !== userId) throw new Error("You can only run your own sends.");

    // Daily cap, counted in Lagos time for the owner of the send.
    const dayStart = new Date();
    const lagos = new Date(dayStart.getTime() + 60 * 60 * 1000);
    lagos.setUTCHours(0, 0, 0, 0);
    const sinceIso = new Date(lagos.getTime() - 60 * 60 * 1000).toISOString();

    const { count: sentToday } = await supabase
      .from("bulk_send_recipients")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "sent")
      .gte("sent_at", sinceIso);

    const capLeft = Math.max(send.daily_cap - (sentToday ?? 0), 0);
    if (capLeft === 0) {
      await supabase.from("bulk_sends").update({ status: "paused" }).eq("id", send.id);
      const { count } = await supabase
        .from("bulk_send_recipients")
        .select("id", { count: "exact", head: true })
        .eq("send_id", send.id)
        .eq("status", "pending");
      return {
        sent: 0,
        failed: 0,
        remaining: count ?? 0,
        capReached: true,
        status: "paused",
        errors: [],
      };
    }

    const take = Math.min(send.batch_size, capLeft);
    const { data: recipients, error: recipientError } = await supabase
      .from("bulk_send_recipients")
      .select("id, email, contact_name, variant")
      .eq("send_id", send.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(take);
    if (recipientError) throw recipientError;

    const fromHeader = send.from_name
      ? `${send.from_name} <${send.from_email}>`
      : send.from_email;
    const replyTo = send.reply_to?.trim() || "quadri@verunda.com";

    const rawVariants = Array.isArray(send.variants) ? send.variants : [];
    const variants = rawVariants
      .map((item) => {
        const record = (item ?? {}) as { subject?: unknown; body?: unknown };
        return {
          subject: String(record.subject ?? "").trim(),
          body: String(record.body ?? "").trim(),
        };
      })
      .filter((item) => item.subject || item.body);

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const recipient of recipients ?? []) {
      const variant = variants[recipient.variant ?? 0];
      const subject = personalize(variant?.subject || send.subject, recipient.contact_name);
      const text = personalize(variant?.body || send.body, recipient.contact_name);

      try {
        const response = await fetch(`${GATEWAY_URL}/emails`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${lovableKey}`,
            "X-Connection-Api-Key": resendKey,
          },
          body: JSON.stringify({
            // Sender is whatever was saved on the Connections page for this send.
            from: fromHeader,
            to: [recipient.email],
            subject,
            // Plain text only: a person-to-person message is far more likely to
            // land in the main inbox than a styled, marketing-looking email.
            text,
            reply_to: replyTo,
            headers: {
              "X-Entity-Ref-ID": crypto.randomUUID(),
            },
          }),
        });


        const bodyText = await response.text();
        if (!response.ok) {
          console.error(`[bulk-send] provider failed [${response.status}]: ${bodyText}`);
          failed += 1;
          if (errors.length < 3) errors.push(`${response.status}: ${bodyText.slice(0, 300)}`);
          await supabase
            .from("bulk_send_recipients")
            .update({ status: "failed", error: bodyText.slice(0, 500) })
            .eq("id", recipient.id);
          continue;
        }

        let providerId: string | null = null;
        try {
          providerId = (JSON.parse(bodyText) as { id?: string }).id ?? null;
        } catch {
          providerId = null;
        }

        sent += 1;
        await supabase
          .from("bulk_send_recipients")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            provider_id: providerId,
            error: null,
          })
          .eq("id", recipient.id);
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : "Unknown error";
        if (errors.length < 3) errors.push(message);
        await supabase
          .from("bulk_send_recipients")
          .update({ status: "failed", error: message.slice(0, 500) })
          .eq("id", recipient.id);
      }
    }

    const { count: remaining } = await supabase
      .from("bulk_send_recipients")
      .select("id", { count: "exact", head: true })
      .eq("send_id", send.id)
      .eq("status", "pending");

    const status = (remaining ?? 0) === 0 ? "completed" : "sending";
    await supabase
      .from("bulk_sends")
      .update({
        sent: send.sent + sent,
        failed: send.failed + failed,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", send.id);

    return {
      sent,
      failed,
      remaining: remaining ?? 0,
      capReached: false,
      status,
      errors,
    };
  });

/** Sends one copy of the drafted message to the sender's own inbox, so it can be checked first. */
export const sendDraftTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      to: string;
      fromName: string;
      fromEmail: string;
      replyTo?: string | undefined;
      subject: string;
      body: string;
      name?: string | undefined;
    }) => {
      const to = String(input?.to ?? "").trim();
      const fromEmail = String(input?.fromEmail ?? "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("Enter a valid test address.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail))
        throw new Error("The sender address is not valid.");
      const subject = String(input?.subject ?? "").trim();
      const body = String(input?.body ?? "").trim();
      if (!subject) throw new Error("Add a subject line first.");
      if (!body) throw new Error("Add a message first.");
      return {
        to,
        fromEmail,
        fromName: String(input?.fromName ?? "").trim() || "Verunda",
        replyTo: String(input?.replyTo ?? "").trim() || "quadri@verunda.com",
        subject: subject.slice(0, 200),
        body: body.slice(0, 2000),
        name: String(input?.name ?? "").trim() || null,
      };
    },
  )
  .handler(async ({ data }): Promise<{ id: string | null }> => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const resendKey = process.env["RESEND_API_KEY"];
    if (!lovableKey || !resendKey) throw new Error("Email sending is not connected yet.");

    const subject = personalize(data.subject, data.name);
    const text = personalize(data.body, data.name);
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6">${escapeHtml(
      text,
    ).replace(/\n/g, "<br />")}</div>`;

    const response = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": resendKey,
      },
      body: JSON.stringify({
        from: `${data.fromName} <${data.fromEmail}>`,
        to: [data.to],
        subject: `[TEST] ${subject}`,
        html,
        text,
        reply_to: data.replyTo,
      }),
    });

    const bodyText = await response.text();
    if (!response.ok) {
      console.error(`[draft-test] failed [${response.status}]: ${bodyText}`);
      throw new Error(`Test email failed [${response.status}]: ${bodyText.slice(0, 300)}`);
    }
    let id: string | null = null;
    try {
      id = (JSON.parse(bodyText) as { id?: string }).id ?? null;
    } catch {
      id = null;
    }
    return { id };
  });
