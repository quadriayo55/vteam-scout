import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { watDayStart } from "./wat";

export type Scope = {
  userId?: string | null | undefined;
  teamId?: string | null | undefined;
};
export type Range = "today" | "7d" | "30d" | "all";

export const RANGE_DAYS: Record<Range, number> = { today: 1, "7d": 7, "30d": 30, all: 30 };

export const RANGE_LABELS: Record<Range, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "All time",
};

function since(range: Range) {
  if (range === "all") return null;
  return watDayStart(RANGE_DAYS[range] - 1).toISOString();
}

export type Totals = { generated: number; clicked: number; pending: number; percent: number };

/** THE single source of truth for generated/clicked counts across the whole app. */
export function totalsQuery(scope: Scope, range: Range = "all") {
  return queryOptions({
    queryKey: ["totals", scope.userId ?? null, scope.teamId ?? null, range],
    refetchInterval: 15000,
    queryFn: async (): Promise<Totals> => {
      const from = since(range);
      const { data, error } = await supabase.rpc("outreach_totals", {
        ...(scope.userId ? { _user_id: scope.userId } : {}),
        ...(scope.teamId ? { _team_id: scope.teamId } : {}),
        ...(from ? { _since: from } : {}),
      });
      if (error) throw error;
      const row = (data as { generated: number; clicked: number }[] | null)?.[0];
      const generated = Number(row?.generated ?? 0);
      const clicked = Number(row?.clicked ?? 0);
      return {
        generated,
        clicked,
        pending: generated - clicked,
        percent: generated ? Math.round((clicked / generated) * 1000) / 10 : 0,
      };
    },
  });
}

export type DailyRow = {
  day: string;
  email_gen: number;
  email_click: number;
  whatsapp_gen: number;
  whatsapp_click: number;
  social_gen: number;
  social_click: number;
  total_gen: number;
  total_click: number;
};

export function dailyQuery(scope: Scope, range: Range) {
  return queryOptions({
    queryKey: ["daily", scope.userId ?? null, scope.teamId ?? null, range],
    refetchInterval: 30000,
    queryFn: async (): Promise<DailyRow[]> => {
      const { data, error } = await supabase.rpc("outreach_daily", {
        _days: RANGE_DAYS[range],
        ...(scope.userId ? { _user_id: scope.userId } : {}),
        ...(scope.teamId ? { _team_id: scope.teamId } : {}),
      });
      if (error) throw error;
      return (data ?? []) as unknown as DailyRow[];
    },
  });
}

export type LeaderRow = {
  user_id: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  team_id: string | null;
  team_name: string | null;
  generated: number;
  clicked: number;
};

export function leaderboardQuery(days: number, teamId?: string | null) {
  return queryOptions({
    queryKey: ["leaderboard", days, teamId ?? null],
    refetchInterval: 30000,
    queryFn: async (): Promise<LeaderRow[]> => {
      const { data, error } = await supabase.rpc("outreach_leaderboard", {
        _days: days,
        ...(teamId ? { _team_id: teamId } : {}),
      });
      if (error) throw error;
      return (data ?? []) as unknown as LeaderRow[];
    },
  });
}

export function teamsQuery() {
  return queryOptions({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("id,name,leader_id,leader_email")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type CampaignOpenRow = {
  campaign_id: string;
  name: string;
  starts_on: string;
  ends_on: string | null;
  is_active: boolean;
  opens: number;
  teams_joined: number;
  generated: number;
  clicked: number;
};

/** Opens, sign-ups and link counts for every campaign, newest first. */
export function campaignOpensQuery() {
  return queryOptions({
    queryKey: ["campaign-opens"],
    refetchInterval: 30000,
    queryFn: async (): Promise<CampaignOpenRow[]> => {
      const { data, error } = await supabase.rpc("campaign_opens_summary");
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...(row as unknown as CampaignOpenRow),
        opens: Number((row as { opens: number }).opens ?? 0),
        teams_joined: Number((row as { teams_joined: number }).teams_joined ?? 0),
        generated: Number((row as { generated: number }).generated ?? 0),
        clicked: Number((row as { clicked: number }).clicked ?? 0),
      }));
    },
  });
}

export type ActivityRow = {
  kind: "team_joined" | "link_open" | "email_sent" | "email_failed";
  happened_at: string;
  title: string;
  detail: string | null;
  team_id: string | null;
  team_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
};

export function activityQuery(limit = 150, campaignId?: string | null) {
  return queryOptions({
    queryKey: ["activity", limit, campaignId ?? null],
    refetchInterval: 20000,
    queryFn: async (): Promise<ActivityRow[]> => {
      const { data, error } = await supabase.rpc("activity_feed", {
        _limit: limit,
        ...(campaignId ? { _campaign_id: campaignId } : {}),
      });
      if (error) throw error;
      return (data ?? []) as unknown as ActivityRow[];
    },
  });
}
