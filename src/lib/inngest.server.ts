import { Inngest } from "inngest";
import { serve } from "inngest/edge";
import { runDueFollowups } from "./followups.server";
import { runBulkBatch, sweepStalledSends } from "./bulk.server";

/**
 * Background scheduling. Inngest runs this work on its own servers, so both
 * bulk sends and follow-ups keep going out even when nobody has the app open.
 */
export const inngest = new Inngest({ id: "verunda-team-scoutier" });

const followupTick = inngest.createFunction(
  {
    id: "followup-tick",
    triggers: [{ cron: "*/5 * * * *" }, { event: "followups/run" }],
  },
  async () => await runDueFollowups(),
);

/** How many batches one background run handles before handing over to a fresh run. */
const BATCHES_PER_RUN = 30;

const bulkSendRun = inngest.createFunction(
  {
    id: "bulk-send-run",
    concurrency: [{ key: "event.data.sendId", limit: 1 }],
    triggers: [{ event: "bulk/send.start" }],
  },
  async ({ event, step }) => {
    const sendId = String((event.data as { sendId?: unknown })?.sendId ?? "");
    if (!sendId) return { sendId: "", batches: 0, sent: 0, failed: 0, status: "invalid" };

    let sent = 0;
    let failed = 0;
    let batches = 0;
    let status = "sending";

    for (let round = 0; round < BATCHES_PER_RUN; round += 1) {
      const result = await step.run(`batch-${round}`, () => runBulkBatch(sendId));
      batches += 1;
      sent += result.sent;
      failed += result.failed;
      status = result.status;
      if (result.stopped) {
        return { sendId, batches, sent, failed, status };
      }
      const gap = await step.run(`gap-${round}`, async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin
          .from("bulk_sends")
          .select("gap_seconds")
          .eq("id", sendId)
          .maybeSingle();
        return data?.gap_seconds ?? 60;
      });
      if (gap > 0) await step.sleep(`wait-${round}`, `${gap}s`);
    }

    // Still work left: continue in a fresh run so a long list never hits limits.
    await step.sendEvent("continue-bulk-send", {
      name: "bulk/send.start",
      data: { sendId },
    });
    return { sendId, batches, sent, failed, status };
  },
);

const bulkSendSweep = inngest.createFunction(
  { id: "bulk-send-sweep", triggers: [{ cron: "*/5 * * * *" }] },
  async ({ step }) => {
    const due = await step.run("find-stalled", () => sweepStalledSends());
    for (const sendId of due) {
      await step.sendEvent(`resume-${sendId}`, {
        name: "bulk/send.start",
        data: { sendId },
      });
    }
    return { resumed: due.length };
  },
);

export const inngestHandler = serve({
  client: inngest,
  functions: [followupTick, bulkSendRun, bulkSendSweep],
});

const GATEWAY_URL = "https://connector-gateway.lovable.dev/inngest";

/** Hands a job to the background scheduler. */
export async function sendInngestEvent(name: string, data: Record<string, unknown>): Promise<void> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const inngestKey = process.env["INNGEST_API_KEY"];
  if (!lovableKey || !inngestKey) {
    throw new Error("Background sending is not connected yet.");
  }

  const response = await fetch(`${GATEWAY_URL}/e/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": inngestKey,
    },
    body: JSON.stringify({ name, data }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`[inngest] event failed [${response.status}]: ${body}`);
    throw new Error(
      `Background sending could not be started [${response.status}]: ${body.slice(0, 300)}`,
    );
  }
}
