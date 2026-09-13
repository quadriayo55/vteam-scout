import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { RowData } from "@/lib/merge";

export type BatchResult = {
  sent: number;
  failed: number;
  remaining: number;
  capReached: boolean;
  status: string;
  errors: string[];
};

/** Sends the next batch of a bulk send. The client calls this repeatedly, pacing with the send's gap. */
export const sendBulkBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sendId: string }) => {
    if (!input?.sendId) throw new Error("sendId is required");
    return { sendId: input.sendId };
  })
  .handler(async ({ data, context }): Promise<BatchResult> => {
    const { supabase, userId } = context;
    const { sendOneEmail } = await import("@/lib/resend.server");

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
      .select("id, email, contact_name, variant, brand, domain, row_data")
      .eq("send_id", send.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(take);
    if (recipientError) throw recipientError;

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
      const result = await sendOneEmail({
        fromName: send.from_name,
        fromEmail: send.from_email,
        replyTo,
        to: recipient.email,
        subject: variant?.subject || send.subject,
        body: variant?.body || send.body,
        context: {
          row: (recipient.row_data ?? {}) as RowData,
          name: recipient.contact_name,
          brand: recipient.brand,
          domain: recipient.domain,
          email: recipient.email,
        },
      });

      if (result.ok) {
        sent += 1;
        await supabase
          .from("bulk_send_recipients")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            provider_id: result.id,
            error: null,
          })
          .eq("id", recipient.id);
      } else {
        failed += 1;
        if (errors.length < 3) errors.push(result.error);
        await supabase
          .from("bulk_send_recipients")
          .update({ status: "failed", error: result.error.slice(0, 500) })
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

    return { sent, failed, remaining: remaining ?? 0, capReached: false, status, errors };
  });

/** Sends one copy of the drafted message, so it can be checked before the real run. */
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
      brand?: string | undefined;
      domain?: string | undefined;
      row?: Record<string, string> | undefined;
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
      const row: Record<string, string> = {};
      for (const [key, value] of Object.entries(input?.row ?? {})) {
        row[String(key)] = String(value ?? "").slice(0, 200);
      }
      return {
        to,
        fromEmail,
        fromName: String(input?.fromName ?? "").trim() || "Verunda",
        replyTo: String(input?.replyTo ?? "").trim() || "quadri@verunda.com",
        subject: subject.slice(0, 200),
        body: body.slice(0, 2000),
        name: String(input?.name ?? "").trim() || null,
        brand: String(input?.brand ?? "").trim() || null,
        domain: String(input?.domain ?? "").trim() || null,
        row,
      };
    },
  )
  .handler(async ({ data }): Promise<{ id: string | null }> => {
    const { sendOneEmail } = await import("@/lib/resend.server");
    const result = await sendOneEmail({
      fromName: data.fromName,
      fromEmail: data.fromEmail,
      replyTo: data.replyTo,
      to: data.to,
      subject: data.subject,
      body: data.body,
      context: {
        row: data.row,
        name: data.name,
        brand: data.brand,
        domain: data.domain,
        email: data.to,
      },
    });
    if (!result.ok) throw new Error(`Test email failed — ${result.error}`);
    return { id: result.id };
  });
