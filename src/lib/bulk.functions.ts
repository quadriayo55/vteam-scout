import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BatchResult = {
  sent: number;
  failed: number;
  remaining: number;
  capReached: boolean;
  status: string;
  errors: string[];
};

type MinimalSupabase = {
  from: (table: "bulk_sends") => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{
          data: { id: string; user_id: string; status: string } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

async function ownedSend(
  supabase: MinimalSupabase,
  sendId: string,
  userId: string,
): Promise<{ id: string; status: string }> {
  const { data, error } = await supabase
    .from("bulk_sends")
    .select("id, user_id, status")
    .eq("id", sendId)
    .maybeSingle();
  if (error || !data) throw new Error("This send could not be found.");
  if (data.user_id !== userId) throw new Error("You can only control your own sends.");
  return { id: data.id, status: data.status };
}

/**
 * Starts (or resumes) a send on the server. Once this returns, the emails keep
 * going out in the background — the app can be closed straight away.
 */
export const startBulkSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sendId: string }) => {
    if (!input?.sendId) throw new Error("sendId is required");
    return { sendId: input.sendId };
  })
  .handler(async ({ data, context }): Promise<{ status: string }> => {
    const { supabase, userId } = context;
    const send = await ownedSend(supabase as never, data.sendId, userId);
    if (send.status === "completed") throw new Error("This send has already finished.");

    const { error } = await supabase
      .from("bulk_sends")
      .update({ status: "sending", updated_at: new Date().toISOString() })
      .eq("id", send.id);
    if (error) throw new Error(error.message);

    // Best effort nudge to the scheduler; the database heartbeat keeps the send
    // moving every minute even if this fails, so it never blocks starting.
    try {
      const { sendInngestEvent } = await import("./inngest.server");
      await sendInngestEvent("bulk/send.start", { sendId: send.id });
    } catch (problem) {
      console.error("[bulk] scheduler nudge failed:", problem);
    }

    // Send the first batch straight away so progress shows immediately.
    try {
      const { runBulkBatch } = await import("./bulk.server");
      await runBulkBatch(send.id);
    } catch (problem) {
      console.error("[bulk] first batch failed:", problem);
    }
    return { status: "sending" };
  });


/** Stops a send that is running. Anything already delivered stays delivered. */
export const stopBulkSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sendId: string }) => {
    if (!input?.sendId) throw new Error("sendId is required");
    return { sendId: input.sendId };
  })
  .handler(async ({ data, context }): Promise<{ status: string }> => {
    const { supabase, userId } = context;
    const send = await ownedSend(supabase as never, data.sendId, userId);
    const { error } = await supabase
      .from("bulk_sends")
      .update({ status: "paused", updated_at: new Date().toISOString() })
      .eq("id", send.id);
    if (error) throw new Error(error.message);
    return { status: "paused" };
  });

/** Sends the next batch straight away, for checking a send by hand. */
export const sendBulkBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sendId: string }) => {
    if (!input?.sendId) throw new Error("sendId is required");
    return { sendId: input.sendId };
  })
  .handler(async ({ data, context }): Promise<BatchResult> => {
    const { supabase, userId } = context;
    await ownedSend(supabase as never, data.sendId, userId);
    const { runBulkBatch } = await import("./bulk.server");
    const result = await runBulkBatch(data.sendId);
    return {
      sent: result.sent,
      failed: result.failed,
      remaining: result.remaining,
      capReached: result.capReached,
      status: result.status,
      errors: result.errors,
    };
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
