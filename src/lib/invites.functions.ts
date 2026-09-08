import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type InviteClickResult = {
  ok: boolean;
  campaignName?: string;
  teamName?: string;
  clicks?: number;
};

export const recordInviteClick = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        code: z.string().min(4).max(64),
        referrer: z.string().max(500).optional(),
        userAgent: z.string().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<InviteClickResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("record_invite_click", {
      _code: data.code,
      ...(data.referrer ? { _referrer: data.referrer } : {}),
      ...(data.userAgent ? { _user_agent: data.userAgent } : {}),
    });
    if (error) throw error;
    const row = (rows as unknown as Array<{
      campaign_name: string;
      team_name: string;
      clicks: number;
    }> | null)?.[0];
    if (!row) return { ok: false };
    return {
      ok: true,
      campaignName: row.campaign_name,
      teamName: row.team_name,
      clicks: Number(row.clicks ?? 0),
    };
  });
