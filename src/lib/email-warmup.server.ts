import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const WARMUP_DAILY_LIMIT = 5000;
export const WARMUP_GAP_SECONDS = 15;

type SendSlot = {
  allowed: boolean;
  reason: "ready" | "pacing" | "daily_limit";
  sentToday: number;
  retryAt: string;
};

/**
 * Reserves one shared delivery slot across bulk sends and follow-ups.
 * The database row is locked while it is checked, so competing workers cannot
 * release two messages during the same minute.
 */
export async function claimEmailSendSlot(userId: string): Promise<SendSlot> {
  const { data, error } = await supabaseAdmin.rpc("claim_email_send_slot", {
    _user_id: userId,
  });
  if (error) throw new Error(error.message);

  const value = (data ?? {}) as Partial<SendSlot>;
  return {
    allowed: value.allowed === true,
    reason:
      value.reason === "daily_limit" || value.reason === "pacing"
        ? value.reason
        : "ready",
    sentToday: Number(value.sentToday ?? 0),
    retryAt: String(value.retryAt ?? new Date().toISOString()),
  };
}