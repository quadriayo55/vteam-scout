import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useProfile, useRoles } from "@/lib/auth";
import { teamsQuery } from "@/lib/stats";
import { formatWat, formatWatDay } from "@/lib/wat";
import { LiveIndicator } from "@/components/LiveIndicator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Link2, Copy, RefreshCw, MousePointerClick, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/team-links")({
  head: () => ({
    meta: [
      { title: "Team Outreach Links — Verunda Team Scoutier" },
      {
        name: "description",
        content:
          "Generate a unique tracked outreach link per team and campaign. Every open is counted and signs the team up automatically.",
      },
      { property: "og:title", content: "Team Outreach Links — Verunda Team Scoutier" },
      {
        property: "og:description",
        content: "Unique tracked links per team with live open counts and automatic campaign sign-up.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TeamLinksPage,
});

type Campaign = { id: string; name: string; starts_on: string; ends_on: string | null; is_active: boolean };
type Invite = {
  id: string;
  campaign_id: string;
  team_id: string;
  code: string;
  clicks: number;
  last_clicked_at: string | null;
  created_at: string;
};

function newCode() {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  for (const byte of bytes) out += chars[byte % chars.length];
  return out;
}

function TeamLinksPage() {
  const { user } = useAuth();
  const profile = useProfile();
  const { isSuperAdmin, isTeamLeader } = useRoles();
  const queryClient = useQueryClient();
  const teams = useQuery(teamsQuery());
  const myTeamId = profile.data?.team_id ?? null;

  const campaigns = useQuery({
    queryKey: ["campaigns", "link-page"],
    queryFn: async (): Promise<Campaign[]> => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id,name,starts_on,ends_on,is_active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Campaign[];
    },
  });

  const invites = useQuery({
    queryKey: ["campaign-invites"],
    refetchInterval: 20000,
    queryFn: async (): Promise<Invite[]> => {
      const { data, error } = await supabase
        .from("campaign_invites")
        .select("id,campaign_id,team_id,code,clicks,last_clicked_at,created_at");
      if (error) throw error;
      return (data ?? []) as Invite[];
    },
  });

  const visibleTeams = (teams.data ?? []).filter((team) =>
    isSuperAdmin ? true : team.id === myTeamId,
  );
  const canManage = isSuperAdmin || isTeamLeader;

  async function generate(campaignId: string, teamId: string) {
    const { error } = await supabase.from("campaign_invites").insert({
      campaign_id: campaignId,
      team_id: teamId,
      code: newCode(),
      created_by: user?.id ?? null,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Tracked link created.");
      queryClient.invalidateQueries({ queryKey: ["campaign-invites"] });
    }
  }

  async function remove(id: string) {
    const { error } = await supabase.from("campaign_invites").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Link removed.");
      queryClient.invalidateQueries({ queryKey: ["campaign-invites"] });
    }
  }

  async function copy(code: string) {
    const url = `${window.location.origin}/j/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied.");
    } catch {
      toast.error(url);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Team Outreach Links</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every team gets its own tracked link. Each open is counted and signs the team up for that
            campaign automatically.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LiveIndicator updatedAt={invites.dataUpdatedAt} />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              queryClient.invalidateQueries();
              toast.success("Synced.");
            }}
          >
            <RefreshCw className="mr-2 size-4" /> Sync
          </Button>
        </div>
      </div>

      {(campaigns.data?.length ?? 0) === 0 ? (
        <section className="panel flex flex-col items-center gap-3 p-10 text-center">
          <Link2 className="size-6 text-brand" />
          <p className="text-sm text-muted-foreground">
            There are no campaigns yet, so there's nothing to link to.
          </p>
        </section>
      ) : (
        <div className="space-y-4">
          {campaigns.data!.map((campaign) => (
            <section key={campaign.id} className="panel p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-lg font-bold">{campaign.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {formatWatDay(campaign.starts_on)} →{" "}
                    {campaign.ends_on ? formatWatDay(campaign.ends_on) : "ongoing"}
                  </p>
                </div>
                <Badge variant={campaign.is_active ? "default" : "secondary"}>
                  {campaign.is_active ? "Active" : "Paused"}
                </Badge>
              </div>

              <ul className="mt-4 space-y-2">
                {visibleTeams.length === 0 && (
                  <li className="py-4 text-center text-sm text-muted-foreground">
                    You're not on a team yet, so there's no link to generate.
                  </li>
                )}
                {visibleTeams.map((team) => {
                  const invite = (invites.data ?? []).find(
                    (row) => row.campaign_id === campaign.id && row.team_id === team.id,
                  );
                  return (
                    <li
                      key={team.id}
                      className="rounded-xl border border-border bg-surface/50 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{team.name}</p>
                          {invite ? (
                            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <MousePointerClick className="size-3.5" />
                              {Number(invite.clicks ?? 0).toLocaleString()} open
                              {Number(invite.clicks) === 1 ? "" : "s"}
                              {invite.last_clicked_at
                                ? ` · last ${formatWat(invite.last_clicked_at)}`
                                : " · no opens yet"}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">No link yet</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {invite ? (
                            <>
                              <Input
                                readOnly
                                className="w-56 text-xs"
                                value={`/j/${invite.code}`}
                                onFocus={(event) => event.currentTarget.select()}
                              />
                              <Button size="sm" variant="secondary" onClick={() => copy(invite.code)}>
                                <Copy className="mr-1.5 size-3.5" /> Copy
                              </Button>
                              {canManage && (
                                <Button variant="ghost" size="icon" onClick={() => remove(invite.id)}>
                                  <Trash2 className="size-4" />
                                </Button>
                              )}
                            </>
                          ) : (
                            canManage && (
                              <Button size="sm" onClick={() => generate(campaign.id, team.id)}>
                                <Plus className="mr-1.5 size-3.5" /> Generate link
                              </Button>
                            )
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
