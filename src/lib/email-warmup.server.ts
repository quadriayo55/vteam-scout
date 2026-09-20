import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Steady-state ceiling only. The real cap ramps up automatically week by week
// as the sending domain builds history — see claim_email_send_slot, which is
// the actual source of truth enforced on every send. This constant just bounds
// how big a single send's own daily_cap can be set.
export const WARMUP_DAILY_LIMIT = 750;
export const WARMUP_GAP_SECONDS = 30;

type SendSlot = {
  allowed: boolean;
  reason: "ready" | "pacing" | "daily_limit";
  sentToday: number;
  dailyCap: number;
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
    reason: value.reason === "daily_limit" || value.reason === "pacing" ? value.reason : "ready",
    sentToday: Number(value.sentToday ?? 0),
    dailyCap: Number(value.dailyCap ?? WARMUP_DAILY_LIMIT),
    retryAt: String(value.retryAt ?? new Date().toISOString()),
  };
}
