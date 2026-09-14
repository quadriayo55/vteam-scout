import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendOneEmail } from "./resend.server";
import type { RowData } from "./merge";

/**
 * Server-side sending engine for bulk sends.
 *
 * It owns the whole job: the background scheduler calls it over and over, so a
 * send keeps going after the person who started it closes the app.
 */

export type BatchOutcome = {
  sent: number;
  failed: number;
  remaining: number;
  capReached: boolean;
  status: string;
  errors: string[];
  stopped: boolean;
};

async function pendingCount(sendId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("bulk_send_recipients")
    .select("id", { count: "exact", head: true })
    .eq("send_id", sendId)
    .eq("status", "pending");
  return count ?? 0;
}

/** Sends one batch of a send. Safe to call repeatedly; it stops itself when paused or finished. */
export async function runBulkBatch(sendId: string): Promise<BatchOutcome> {
  const { data: send, error: sendError } = await supabaseAdmin
    .from("bulk_sends")
    .select("*")
    .eq("id", sendId)
    .maybeSingle();
  if (sendError) throw new Error(sendError.message);
  if (!send) {
    return {
      sent: 0,
      failed: 0,
      remaining: 0,
      capReached: false,
      status: "missing",
      errors: [],
      stopped: true,
    };
  }

  if (send.status !== "sending") {
    return {
      sent: 0,
      failed: 0,
      remaining: await pendingCount(send.id),
      capReached: false,
      status: send.status,
      errors: [],
      stopped: true,
    };
  }

  // Daily cap, counted in Lagos time for the owner of the send.
  const lagos = new Date(Date.now() + 60 * 60 * 1000);
  lagos.setUTCHours(0, 0, 0, 0);
  const sinceIso = new Date(lagos.getTime() - 60 * 60 * 1000).toISOString();

  const { count: sentToday } = await supabaseAdmin
    .from("bulk_send_recipients")
    .select("id", { count: "exact", head: true })
    .eq("user_id", send.user_id)
    .eq("status", "sent")
    .gte("sent_at", sinceIso);

  const capLeft = Math.max(send.daily_cap - (sentToday ?? 0), 0);
  if (capLeft === 0) {
    await supabaseAdmin
      .from("bulk_sends")
      .update({ status: "paused", updated_at: new Date().toISOString() })
      .eq("id", send.id);
    return {
      sent: 0,
      failed: 0,
      remaining: await pendingCount(send.id),
      capReached: true,
      status: "paused",
      errors: [],
      stopped: true,
    };
  }

  const take = Math.min(send.batch_size, capLeft);
  const { data: recipients, error: recipientError } = await supabaseAdmin
    .from("bulk_send_recipients")
    .select("id, email, contact_name, variant, brand, domain, row_data")
    .eq("send_id", send.id)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(take);
  if (recipientError) throw new Error(recipientError.message);

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
      await supabaseAdmin
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
      await supabaseAdmin
        .from("bulk_send_recipients")
        .update({ status: "failed", error: result.error.slice(0, 500) })
        .eq("id", recipient.id);
    }
  }

  const remaining = await pendingCount(send.id);

  // Someone may have pressed Stop while this batch was going out.
  const { data: fresh } = await supabaseAdmin
    .from("bulk_sends")
    .select("status")
    .eq("id", send.id)
    .maybeSingle();
  const wasStopped = fresh?.status !== "sending";

  const status =
    remaining === 0 ? "completed" : wasStopped ? (fresh?.status ?? "paused") : "sending";
  await supabaseAdmin
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
    remaining,
    capReached: false,
    status,
    errors,
    stopped: remaining === 0 || wasStopped,
  };
}

/**
 * Picks up sends that are marked as sending but have gone quiet — for example
 * because a background run was interrupted — and nudges them along.
 */
export async function sweepStalledSends(): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("bulk_sends")
    .select("id, updated_at, gap_seconds")
    .eq("status", "sending")
    .order("updated_at", { ascending: true })
    .limit(10);

  const due: string[] = [];
  for (const row of data ?? []) {
    const quietFor = Date.now() - new Date(row.updated_at).getTime();
    const wait = Math.max(row.gap_seconds, 60) * 1000 + 120000;
    if (quietFor > wait) due.push(row.id);
  }
  return due;
}
