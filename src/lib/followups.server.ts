import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendOneEmail } from "./resend.server";
import { claimEmailSendSlot } from "./email-warmup.server";
import type { RowData } from "./merge";

/**
 * Runs whatever follow-up work is due right now.
 *
 * Each run takes one batch per due step and leaves the rest for the next run,
 * so a long list is paced instead of being fired off in one burst. Audience
 * rules are re-checked at this moment, so anyone who has since replied,
 * clicked or opened drops out automatically.
 */

type Variant = { subject: string; body: string };

function variantIndex(index: number, count: number, rotation: string, size: number): number {
  if (count <= 1) return 0;
  if (rotation === "random") return Math.floor(Math.random() * count);
  if (rotation === "blocks") return Math.floor(index / Math.max(1, size)) % count;
  return index % count;
}

export type RunSummary = {
  steps: number;
  sent: number;
  failed: number;
  skipped: number;
};

export async function runDueFollowups(): Promise<RunSummary> {
  const nowIso = new Date().toISOString();
  const summary: RunSummary = { steps: 0, sent: 0, failed: 0, skipped: 0 };

  const { data: steps, error } = await supabaseAdmin
    .from("followup_steps")
    .select("*")
    .in("status", ["scheduled", "running"])
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(10);
  if (error) throw new Error(error.message);

  for (const step of steps ?? []) {
    const { data: sequence } = await supabaseAdmin
      .from("followup_sequences")
      .select("*")
      .eq("id", step.sequence_id)
      .maybeSingle();
    if (!sequence || sequence.status !== "active") continue;

    const { data: send } = await supabaseAdmin
      .from("bulk_sends")
      .select("id, from_name, from_email, reply_to")
      .eq("id", sequence.send_id)
      .maybeSingle();
    if (!send) continue;

    summary.steps += 1;
    if (step.status !== "running") {
      await supabaseAdmin
        .from("followup_steps")
        .update({ status: "running", started_at: new Date().toISOString() })
        .eq("id", step.id);
    }

    const variants = (Array.isArray(step.variants) ? step.variants : [])
      .map((item) => {
        const record = (item ?? {}) as { subject?: unknown; body?: unknown };
        return {
          subject: String(record.subject ?? "").trim(),
          body: String(record.body ?? "").trim(),
        };
      })
      .filter((item: Variant) => item.subject && item.body);
    if (variants.length === 0) {
      await supabaseAdmin
        .from("followup_steps")
        .update({ status: "failed", error: "This step has no message saved." })
        .eq("id", step.id);
      continue;
    }

    // Everyone the original email actually reached.
    const { data: recipients } = await supabaseAdmin
      .from("bulk_send_recipients")
      .select(
        "id, email, contact_name, brand, domain, row_data, replied_at, first_click_at, first_open_at, bounced_at, complained_at",
      )
      .eq("send_id", sequence.send_id)
      .eq("status", "sent")
      .order("created_at", { ascending: true });

    const { data: done } = await supabaseAdmin
      .from("followup_deliveries")
      .select("recipient_id")
      .eq("step_id", step.id);
    const already = new Set((done ?? []).map((row) => row.recipient_id));

    const queue = (recipients ?? []).filter((row) => !already.has(row.id));
    // The shared pacing gate permits one outreach message at a time across
    // bulk sends and every active follow-up sequence.
    const batch = queue.slice(0, 1);

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    let processed = 0;

    for (const [offset, recipient] of batch.entries()) {
      const index = already.size + offset;

      const excluded =
        Boolean(recipient.bounced_at) ||
        Boolean(recipient.complained_at) ||
        (sequence.audience_mode === "non_responders" &&
          ((sequence.exclude_replied && Boolean(recipient.replied_at)) ||
            (sequence.exclude_clicked && Boolean(recipient.first_click_at)) ||
            (sequence.exclude_opened && Boolean(recipient.first_open_at))));

      if (excluded) {
        skipped += 1;
        processed += 1;
        await supabaseAdmin.from("followup_deliveries").insert({
          step_id: step.id,
          sequence_id: sequence.id,
          recipient_id: recipient.id,
          user_id: step.user_id,
          email: recipient.email,
          status: "skipped",
          variant: 0,
        });
        continue;
      }

      const slot = await claimEmailSendSlot(step.user_id);
      if (!slot.allowed) break;

      const pick = variantIndex(index, variants.length, step.rotation, step.rotation_size);
      const variant = variants[pick]!;
      const result = await sendOneEmail({
        fromName: send.from_name,
        fromEmail: send.from_email,
        replyTo: send.reply_to?.trim() || send.from_email,
        to: recipient.email,
        subject: variant.subject,
        body: variant.body,
        context: {
          row: (recipient.row_data ?? {}) as RowData,
          name: recipient.contact_name,
          brand: recipient.brand,
          domain: recipient.domain,
          email: recipient.email,
        },
      });

      if (!result.ok && result.suppressed) {
        // Unsubscribed, previously bounced or malformed: left out, not a failure.
        skipped += 1;
        await supabaseAdmin.from("followup_deliveries").insert({
          step_id: step.id,
          sequence_id: sequence.id,
          recipient_id: recipient.id,
          user_id: step.user_id,
          email: recipient.email,
          status: "skipped",
          variant: pick,
          error: result.error.slice(0, 500),
        });
      } else if (result.ok) {
        sent += 1;
        await supabaseAdmin.from("followup_deliveries").insert({
          step_id: step.id,
          sequence_id: sequence.id,
          recipient_id: recipient.id,
          user_id: step.user_id,
          email: recipient.email,
          status: "sent",
          variant: pick,
          provider_id: result.id,
          sent_at: new Date().toISOString(),
        });
      } else {
        failed += 1;
        await supabaseAdmin.from("followup_deliveries").insert({
          step_id: step.id,
          sequence_id: sequence.id,
          recipient_id: recipient.id,
          user_id: step.user_id,
          email: recipient.email,
          status: "failed",
          variant: pick,
          error: result.error.slice(0, 500),
        });
      }
      processed += 1;
    }

    const finished = queue.length - processed === 0;
    await supabaseAdmin
      .from("followup_steps")
      .update({
        sent: step.sent + sent,
        failed: step.failed + failed,
        skipped: step.skipped + skipped,
        status: finished ? "completed" : "running",
        completed_at: finished ? new Date().toISOString() : null,
      })
      .eq("id", step.id);

    summary.sent += sent;
    summary.failed += failed;
    summary.skipped += skipped;

    if (finished) {
      const { count: left } = await supabaseAdmin
        .from("followup_steps")
        .select("id", { count: "exact", head: true })
        .eq("sequence_id", sequence.id)
        .in("status", ["scheduled", "running"]);
      if ((left ?? 0) === 0) {
        await supabaseAdmin
          .from("followup_sequences")
          .update({ status: "completed", updated_at: new Date().toISOString() })
          .eq("id", sequence.id);
      }
    }
  }

  return summary;
}
