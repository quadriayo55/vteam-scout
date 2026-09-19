import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendOneEmail } from "./resend.server";
import { claimEmailSendSlot, WARMUP_DAILY_LIMIT } from "./email-warmup.server";
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

async function recountTotals(sendId: string): Promise<{ sent: number; failed: number }> {
  const [{ count: sent }, { count: failed }] = await Promise.all([
    supabaseAdmin
      .from("bulk_send_recipients")
      .select("id", { count: "exact", head: true })
      .eq("send_id", sendId)
      .eq("status", "sent"),
    supabaseAdmin
      .from("bulk_send_recipients")
      .select("id", { count: "exact", head: true })
      .eq("send_id", sendId)
      .eq("status", "failed"),
  ]);
  return { sent: sent ?? 0, failed: failed ?? 0 };
}

function idle(status: string, remaining: number, capReached = false): BatchOutcome {
  return { sent: 0, failed: 0, remaining, capReached, status, errors: [], stopped: true };
}

/**
 * Sends one batch of a send. Safe to call repeatedly and safe to call from two
 * places at once: only one runner can hold a send at a time, and every contact
 * is claimed in the database before any email goes out, so nobody is emailed twice.
 */
export async function runBulkBatch(sendId: string): Promise<BatchOutcome> {
  const { data: send, error: sendError } = await supabaseAdmin
    .from("bulk_sends")
    .select("*")
    .eq("id", sendId)
    .maybeSingle();
  if (sendError) throw new Error(sendError.message);
  if (!send) return idle("missing", 0);
  if (send.status !== "sending") return idle(send.status, await pendingCount(send.id));

  // One runner at a time per send.
  const { data: gotLock } = await supabaseAdmin.rpc("try_lock_bulk_send", {
    _send_id: send.id,
    _seconds: 300,
  });
  if (!gotLock) return idle("sending", await pendingCount(send.id));

  try {
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

    const capLeft = Math.max(Math.min(send.daily_cap, WARMUP_DAILY_LIMIT) - (sentToday ?? 0), 0);
    if (capLeft === 0) {
      return idle("sending", await pendingCount(send.id), true);
    }

    // Honour the batch size saved on the send; the shared pacing gate still spaces
    // each individual message inside the batch.
    const take = Math.max(1, Math.min(send.batch_size || 1, 100, capLeft));
    const { data: recipients, error: claimError } = await supabaseAdmin.rpc(
      "claim_bulk_recipients",
      { _send_id: send.id, _limit: take },
    );
    if (claimError) throw new Error(claimError.message);

    const replyTo = send.reply_to?.trim() || send.from_email;

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
    let capReached = false;
    const errors: string[] = [];
    const queue = recipients ?? [];
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    for (const [index, recipient] of queue.entries()) {
      // Wait for this message's turn at the shared pacing gate.
      let slot = await claimEmailSendSlot(send.user_id);
      if (!slot.allowed && slot.reason === "pacing") {
        const waitMs = Math.max(
          0,
          Math.min(new Date(slot.retryAt).getTime() - Date.now() + 250, 20000),
        );
        await sleep(waitMs);
        slot = await claimEmailSendSlot(send.user_id);
      }
      if (!slot.allowed) {
        capReached = slot.reason === "daily_limit";
        // Hand the rest of the batch back so a later run picks it up.
        const leftover = queue.slice(index).map((row) => row.id);
        if (leftover.length > 0) {
          await supabaseAdmin
            .from("bulk_send_recipients")
            .update({ status: "pending", claimed_at: null })
            .in("id", leftover);
        }
        break;
      }

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
      } else if (result.suppressed) {
        // Unsubscribed, previously bounced or malformed: set aside, not a failure.
        if (errors.length < 3) errors.push(result.error);
        await supabaseAdmin
          .from("bulk_send_recipients")
          .update({ status: "skipped", error: result.error.slice(0, 500) })
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

    // Counted fresh from the rows, so two runs can never inflate the totals.
    const totals = await recountTotals(send.id);
    await supabaseAdmin
      .from("bulk_sends")
      .update({
        sent: totals.sent,
        failed: totals.failed,
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
  } finally {
    await supabaseAdmin.rpc("release_bulk_send_lock", { _send_id: send.id });
  }
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
