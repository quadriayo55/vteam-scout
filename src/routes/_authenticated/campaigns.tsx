import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useProfile, useRoles } from "@/lib/auth";
import { teamsQuery } from "@/lib/stats";
import { formatWatDay } from "@/lib/wat";
import { compact } from "@/lib/outreach";
import { LiveIndicator } from "@/components/LiveIndicator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Megaphone, Plus, RefreshCw, Trash2, Users, Target, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/campaigns")({
  head: () => ({
    meta: [
      { title: "Outreach Campaigns — Verunda Team Scoutier" },
      {
        name: "description",
        content:
          "Create outreach campaigns, set a target for every team and track which teams have signed up and how far along they are.",
      },
      { property: "og:title", content: "Outreach Campaigns — Verunda Team Scoutier" },
      {
        property: "og:description",
        content: "Set per-team outreach targets and track sign-ups and live progress.",
      },
    ],
  }),
  component: CampaignsPage,
});

type Campaign = {
  id: string;
  name: string;
  description: string | null;
  starts_on: string;
  ends_on: string | null;
  is_active: boolean;
  created_at: string;
};

type ProgressRow = {
  team_id: string;
  team_name: string;
  target: number;
  joined_at: string | null;
  generated: number;
  clicked: number;
};

function todayWat() {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

function CampaignsPage() {
  const { user } = useAuth();
  const profile = useProfile();
  const { isSuperAdmin } = useRoles();
  const queryClient = useQueryClient();

  const teams = useQuery(teamsQuery());
  const [openForm, setOpenForm] = useState(false);

  const campaigns = useQuery({
    queryKey: ["campaigns"],
    refetchInterval: 30000,
    queryFn: async (): Promise<Campaign[]> => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id,name,description,starts_on,ends_on,is_active,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Campaign[];
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Outreach Campaigns</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Set a target for every team and watch sign-ups and progress in real time.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LiveIndicator updatedAt={campaigns.dataUpdatedAt} />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              queryClient.invalidateQueries();
              toast.success("Synced with the database.");
            }}
          >
            <RefreshCw className="mr-2 size-4" /> Sync
          </Button>
          {isSuperAdmin && (
            <Button size="sm" onClick={() => setOpenForm((v) => !v)}>
              <Plus className="mr-2 size-4" /> New campaign
            </Button>
          )}
        </div>
      </div>

      {isSuperAdmin && openForm && (
        <NewCampaignForm
          teams={teams.data ?? []}
          userId={user?.id ?? null}
          onDone={() => {
            setOpenForm(false);
            queryClient.invalidateQueries({ queryKey: ["campaigns"] });
          }}
        />
      )}

      {campaigns.isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading campaigns…</p>
      ) : (campaigns.data?.length ?? 0) === 0 ? (
        <section className="panel flex flex-col items-center gap-3 p-10 text-center">
          <Megaphone className="size-6 text-brand" />
          <p className="text-sm text-muted-foreground">
            No campaigns yet.
            {isSuperAdmin
              ? " Create the first one to give each team a target."
              : " Your super admin hasn't created one yet."}
          </p>
        </section>
      ) : (
        <div className="space-y-4">
          {campaigns.data!.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              isSuperAdmin={isSuperAdmin}
              myTeamId={profile.data?.team_id ?? null}
              userId={user?.id ?? null}
              allTeams={teams.data ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type TeamRow = { id: string; name: string };

function NewCampaignForm({
  teams,
  userId,
  onDone,
}: {
  teams: TeamRow[];
  userId: string | null;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startsOn, setStartsOn] = useState(todayWat());
  const [endsOn, setEndsOn] = useState("");
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      toast.error("Give the campaign a name.");
      return;
    }
    const picked = Object.entries(targets).filter(([, value]) => value.trim() !== "");
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("campaigns")
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          starts_on: startsOn,
          ends_on: endsOn || null,
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (picked.length) {
        const { error: teamError } = await supabase.from("campaign_teams").insert(
          picked.map(([teamId, value]) => ({
            campaign_id: data.id,
            team_id: teamId,
            target: Math.max(0, Number(value) || 0),
            assigned_by: userId,
          })),
        );
        if (teamError) throw teamError;
      }
      toast.success("Campaign created.");
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't create the campaign.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel space-y-4 p-4 sm:p-6">
      <h2 className="font-display text-lg font-bold">New campaign</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="c-name">Campaign name</Label>
          <Input
            id="c-name"
            maxLength={120}
            value={name}
            placeholder="September Shopify Push"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="c-desc">What is it about? (optional)</Label>
          <Textarea
            id="c-desc"
            rows={2}
            maxLength={500}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="c-start">Starts</Label>
          <Input
            id="c-start"
            type="date"
            value={startsOn}
            onChange={(event) => setStartsOn(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="c-end">Ends (optional)</Label>
          <Input
            id="c-end"
            type="date"
            value={endsOn}
            onChange={(event) => setEndsOn(event.target.value)}
          />
        </div>
      </div>

      <div>
        <Label>Target per team — leave blank to skip a team</Label>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {teams.map((team) => (
            <div
              key={team.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface/50 px-3 py-2"
            >
              <span className="truncate text-sm font-semibold">{team.name}</span>
              <Input
                className="w-28"
                type="number"
                min={0}
                placeholder="0"
                value={targets[team.id] ?? ""}
                onChange={(event) =>
                  setTargets((prev) => ({ ...prev, [team.id]: event.target.value }))
                }
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Create campaign"}
        </Button>
        <Button variant="secondary" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
      </div>
    </section>
  );
}

function CampaignCard({
  campaign,
  isSuperAdmin,
  myTeamId,
  userId,
  allTeams,
}: {
  campaign: Campaign;
  isSuperAdmin: boolean;
  myTeamId: string | null;
  userId: string | null;
  allTeams: TeamRow[];
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const progress = useQuery({
    queryKey: ["campaign-progress", campaign.id],
    refetchInterval: 20000,
    queryFn: async (): Promise<ProgressRow[]> => {
      const { data, error } = await supabase.rpc("campaign_progress", {
        _campaign_id: campaign.id,
      });
      if (error) throw error;
      return (data ?? []) as unknown as ProgressRow[];
    },
  });

  const rows = progress.data ?? [];
  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          target: acc.target + Number(row.target ?? 0),
          generated: acc.generated + Number(row.generated ?? 0),
          clicked: acc.clicked + Number(row.clicked ?? 0),
          signed: acc.signed + (row.joined_at ? 1 : 0),
        }),
        { target: 0, generated: 0, clicked: 0, signed: 0 },
      ),
    [rows],
  );

  const mine = rows.find((row) => row.team_id === myTeamId);
  const canJoin = !!myTeamId && !mine?.joined_at;

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["campaign-progress", campaign.id] });
  }

  async function joinCampaign() {
    if (!myTeamId) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("campaign_teams").upsert(
        {
          campaign_id: campaign.id,
          team_id: myTeamId,
          joined_at: new Date().toISOString(),
          ...(mine ? {} : { target: 0, assigned_by: userId }),
        },
        { onConflict: "campaign_id,team_id" },
      );
      if (error) throw error;
      toast.success("Your team has signed up.");
      refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Only team leaders can sign a team up.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function setTarget(teamId: string, value: number) {
    const { error } = await supabase
      .from("campaign_teams")
      .update({ target: Math.max(0, value) })
      .eq("campaign_id", campaign.id)
      .eq("team_id", teamId);
    if (error) toast.error("Couldn't save that target.");
    else refresh();
  }

  async function addTeam(teamId: string) {
    const { error } = await supabase
      .from("campaign_teams")
      .insert({ campaign_id: campaign.id, team_id: teamId, target: 0, assigned_by: userId });
    if (error) toast.error("Couldn't add that team.");
    else refresh();
  }

  async function removeTeam(teamId: string) {
    const { error } = await supabase
      .from("campaign_teams")
      .delete()
      .eq("campaign_id", campaign.id)
      .eq("team_id", teamId);
    if (error) toast.error("Couldn't remove that team.");
    else refresh();
  }

  async function toggleActive(next: boolean) {
    const { error } = await supabase
      .from("campaigns")
      .update({ is_active: next })
      .eq("id", campaign.id);
    if (error) toast.error("Couldn't update the campaign.");
    else queryClient.invalidateQueries({ queryKey: ["campaigns"] });
  }

  async function deleteCampaign() {
    const { error } = await supabase.from("campaigns").delete().eq("id", campaign.id);
    if (error) toast.error("Couldn't delete the campaign.");
    else {
      toast.success("Campaign deleted.");
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    }
  }

  const unassigned = allTeams.filter((team) => !rows.some((row) => row.team_id === team.id));
  const pct = totals.target ? Math.min(100, (totals.generated / totals.target) * 100) : 0;

  return (
    <section className="panel p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-bold">{campaign.name}</h2>
            <Badge variant={campaign.is_active ? "default" : "secondary"}>
              {campaign.is_active ? "Active" : "Paused"}
            </Badge>
          </div>
          {campaign.description && (
            <p className="mt-1 text-sm text-muted-foreground">{campaign.description}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {formatWatDay(campaign.starts_on)} →{" "}
            {campaign.ends_on ? formatWatDay(campaign.ends_on) : "ongoing"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canJoin && (
            <Button size="sm" onClick={joinCampaign} disabled={busy}>
              <Check className="mr-2 size-4" /> Sign my team up
            </Button>
          )}
          {isSuperAdmin && (
            <>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                Active
                <Switch checked={campaign.is_active} onCheckedChange={toggleActive} />
              </span>
              <Button variant="ghost" size="icon" onClick={deleteCampaign}>
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Metric label="Teams signed up" value={`${totals.signed}/${rows.length}`} icon={<Users className="size-4" />} />
        <Metric label="Total target" value={compact(totals.target)} icon={<Target className="size-4" />} />
        <Metric label="Generated" value={compact(totals.generated)} />
        <Metric label="Clicked" value={compact(totals.clicked)} />
      </div>

      <Progress value={pct} className="mt-4" />

      <ul className="mt-4 space-y-2">
        {rows.length === 0 && (
          <li className="py-4 text-center text-sm text-muted-foreground">
            No teams on this campaign yet.
          </li>
        )}
        {rows.map((row) => {
          const target = Number(row.target ?? 0);
          const generated = Number(row.generated ?? 0);
          const teamPct = target ? Math.min(100, (generated / target) * 100) : 0;
          return (
            <li key={row.team_id} className="rounded-xl border border-border bg-surface/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{row.team_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {generated.toLocaleString()} of {target.toLocaleString()} ·{" "}
                    {Number(row.clicked ?? 0).toLocaleString()} clicked
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {row.joined_at ? (
                    <Badge className="bg-success text-success-foreground">Signed up</Badge>
                  ) : (
                    <Badge variant="secondary">Not signed up</Badge>
                  )}
                  {isSuperAdmin && (
                    <>
                      <Input
                        className="w-24"
                        type="number"
                        min={0}
                        defaultValue={target}
                        onBlur={(event) => {
                          const next = Number(event.target.value) || 0;
                          if (next !== target) setTarget(row.team_id, next);
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeTeam(row.team_id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <Progress value={teamPct} className="mt-2" />
            </li>
          );
        })}
      </ul>

      {isSuperAdmin && unassigned.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">Add a team:</span>
          {unassigned.map((team) => (
            <Button
              key={team.id}
              variant="secondary"
              size="sm"
              onClick={() => addTeam(team.id)}
            >
              <Plus className="mr-1.5 size-3.5" /> {team.name}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface/50 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </p>
      <p className="mt-1 font-display text-xl font-bold">{value}</p>
    </div>
  );
}
