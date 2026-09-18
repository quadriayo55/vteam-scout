import { createFileRoute } from "@tanstack/react-router";

/**
 * Heartbeat for background sending.
 *
 * The database calls this every minute. Each call moves every running send one
 * batch forward and pushes out any follow-ups that are due, so sending never
 * depends on someone keeping the app open.
 */
async function tick(request: Request): Promise<Response> {
  const secret = process.env["BULK_TICK_SECRET"];
  if (!secret) return new Response("Not configured", { status: 500 });
  if (request.headers.get("x-tick-key") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runBulkBatch } = await import("@/lib/bulk.server");

  const runFollowups = async () => {
    try {
      const { runDueFollowups } = await import("@/lib/followups.server");
      const outcome = await runDueFollowups();
      return (outcome as { sent?: number } | undefined)?.sent ?? 0;
    } catch (problem) {
      console.error("[bulk-tick] follow-ups failed:", problem);
      return 0;
    }
  };

  const { data: running } = await supabaseAdmin
    .from("bulk_sends")
    .select("id, gap_seconds, updated_at")
    .eq("status", "sending")
    .order("updated_at", { ascending: true })
    .limit(5);

  const results: Array<{ sendId: string; sent: number; failed: number; status: string }> = [];
  // Alternate priority each minute. The shared gate still releases only one
  // message, while this prevents a large bulk send from starving follow-ups.
  const followupsFirst = new Date().getUTCMinutes() % 2 === 0;
  let followups = followupsFirst ? await runFollowups() : 0;

  for (const send of running ?? []) {
    const quietFor = Date.now() - new Date(send.updated_at).getTime();
    // Respect the gap the owner chose between batches.
    if (quietFor < Math.max(send.gap_seconds ?? 60, 5) * 1000 - 5000) continue;
    try {
      const outcome = await runBulkBatch(send.id);
      results.push({
        sendId: send.id,
        sent: outcome.sent,
        failed: outcome.failed,
        status: outcome.status,
      });
    } catch (problem) {
      console.error(`[bulk-tick] ${send.id} failed:`, problem);
    }
  }

  if (!followupsFirst) followups = await runFollowups();

  return Response.json({ ok: true, batches: results, followups });
}

export const Route = createFileRoute("/api/public/hooks/bulk-tick")({
  server: {
    handlers: {
      POST: ({ request }) => tick(request),
      GET: ({ request }) => tick(request),
    },
  },
});
