import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, usePermissions } from "@/lib/auth";
import { formatWatDay } from "@/lib/wat";
import { compact } from "@/lib/outreach";
import { RoleGate } from "@/components/RoleGate";
import { LiveIndicator } from "@/components/LiveIndicator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Megaphone, Plus, RefreshCw, Trash2, Target, MousePointerClick } from "lucide-react";

export const Route = createFileRoute("/_authenticated/campaigns")({
  head: () => ({
    meta: [
      { title: "Outreach Campaigns — Verunda Team Scoutier" },
      {
        name: "description",
        content:
          "Create outreach campaigns, set an overall target and watch progress against it in real time.",
      },
      { property: "og:title", content: "Outreach Campaigns — Verunda Team Scoutier" },
      {
        property: "og:description",
        content: "Set outreach targets and track live progress against them.",
      },
    ],
  }),
  component: () => (
    <RoleGate need="manageCampaigns">
      <CampaignsPage />
    </RoleGate>
  ),
});

type Campaign = {
  id: string;
  name: string;
  description: string | null;
  starts_on: string;
  ends_on: string | null;
  is_active: boolean;
  target: number;
  created_at: string;
};

function todayWat() {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

function CampaignsPage() {
  const { user } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const queryClient = useQueryClient();
  const [openForm, setOpenForm] = useState(false);

  const campaigns = useQuery({
    queryKey: ["campaigns"],
    refetchInterval: 30000,
    queryFn: async (): Promise<Campaign[]> => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id,name,description,starts_on,ends_on,is_active,target,created_at")
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
            Set a target for each campaign and watch progress in real time.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LiveIndicator updatedAt={campaigns.dataUpdatedAt} />
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
          <Button size="sm" onClick={() => setOpenForm((v) => !v)}>
            <Plus className="mr-2 size-4" /> New campaign
          </Button>
        </div>
      </div>

      {openForm && (
        <NewCampaignForm
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
            No campaigns yet. Create the first one and give it a target.
          </p>
        </section>
      ) : (
        <div className="space-y-4">
          {campaigns.data!.map((campaign) => (
            <CampaignCard key={campaign.id} campaign={campaign} canDelete={isSuperAdmin} />
          ))}
        </div>
      )}
    </div>
  );
}

function NewCampaignForm({ userId, onDone }: { userId: string | null; onDone: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startsOn, setStartsOn] = useState(todayWat());
  const [endsOn, setEndsOn] = useState("");
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      toast.error("Give the campaign a name.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("campaigns").insert({
        name: name.trim(),
        description: description.trim() || null,
        starts_on: startsOn,
        ends_on: endsOn || null,
        target: Math.max(0, Number(target) || 0),
        created_by: userId,
      });
      if (error) throw error;
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
        <div className="space-y-2">
          <Label htmlFor="c-target">Target contacts</Label>
          <Input
            id="c-target"
            type="number"
            min={0}
            placeholder="1000"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          />
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


type CampaignEmailTotals = {
  emails_sent: number;
  delivered: number;
  opened: number;
  replied: number;
  bounced: number;
  link_opens: number;
};

type CampaignLink = {
  id: string;
  code: string;
  label: string | null;
  clicks: number;
  last_clicked_at: string | null;
  team_id: string;
};

function CampaignCard({ campaign, canDelete }: { campaign: Campaign; canDelete: boolean }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState(String(campaign.target ?? 0));

  const totals = useQuery({
    queryKey: ["campaign-email-totals", campaign.id],
    refetchInterval: 30000,
    queryFn: async (): Promise<CampaignEmailTotals> => {
      const { data, error } = await supabase.rpc("campaign_email_totals", {
        _campaign_id: campaign.id,
      });
      if (error) throw error;
      const row = (data as CampaignEmailTotals[] | null)?.[0];
      return {
        emails_sent: Number(row?.emails_sent ?? 0),
        delivered: Number(row?.delivered ?? 0),
        opened: Number(row?.opened ?? 0),
        replied: Number(row?.replied ?? 0),
        bounced: Number(row?.bounced ?? 0),
        link_opens: Number(row?.link_opens ?? 0),
      };
    },
  });

  const sent = totals.data?.emails_sent ?? 0;
  const percent = campaign.target ? Math.min(100, Math.round((sent / campaign.target) * 100)) : 0;

  async function saveTarget() {
    const { error } = await supabase
      .from("campaigns")
      .update({ target: Math.max(0, Number(target) || 0) })
      .eq("id", campaign.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEditing(false);
    await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    toast.success("Target updated.");
  }

  async function togglePaused() {
    const { error } = await supabase
      .from("campaigns")
      .update({ is_active: !campaign.is_active })
      .eq("id", campaign.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    toast.success(campaign.is_active ? "Campaign paused." : "Campaign is running again.");
  }

  async function remove() {
    const { error } = await supabase.from("campaigns").delete().eq("id", campaign.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    toast.success("Campaign deleted.");
  }

  return (
    <section className="panel space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-bold">{campaign.name}</h2>
            <Badge variant={campaign.is_active ? "default" : "secondary"}>
              {campaign.is_active ? "Running" : "Paused"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatWatDay(campaign.starts_on)}
            {campaign.ends_on ? ` — ${formatWatDay(campaign.ends_on)}` : " — ongoing"}
          </p>
          {campaign.description && (
            <p className="mt-2 text-sm text-muted-foreground">{campaign.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="sm" onClick={togglePaused}>
            {campaign.is_active ? "Pause" : "Continue"}
          </Button>
          {canDelete && (
            <Button variant="ghost" size="sm" onClick={remove}>
              <Trash2 className="mr-2 size-4" /> Delete
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border border-border bg-surface/50 p-3">
          <p className="flex items-center gap-1.5 text-[11px] uppercase text-muted-foreground">
            <Target className="size-3.5" /> Target
          </p>
          {editing ? (
            <div className="mt-1 flex gap-2">
              <Input
                className="h-8 w-24"
                type="number"
                min={0}
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              />
              <Button size="sm" className="h-8" onClick={saveTarget}>
                Save
              </Button>
            </div>
          ) : (
            <button
              className="mt-1 font-display text-xl font-bold hover:text-brand"
              onClick={() => setEditing(true)}
            >
              {compact(campaign.target ?? 0)}
            </button>
          )}
        </div>
        <div className="rounded-xl border border-border bg-surface/50 p-3">
          <p className="text-[11px] uppercase text-muted-foreground">Emails sent</p>
          <p className="mt-1 font-display text-xl font-bold">{compact(sent)}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface/50 p-3">
          <p className="text-[11px] uppercase text-muted-foreground">Reached inbox</p>
          <p className="mt-1 font-display text-xl font-bold">
            {compact(totals.data?.delivered ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface/50 p-3">
          <p className="text-[11px] uppercase text-muted-foreground">Replies</p>
          <p className="mt-1 font-display text-xl font-bold text-success">
            {compact(totals.data?.replied ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface/50 p-3">
          <p className="flex items-center gap-1.5 text-[11px] uppercase text-muted-foreground">
            <MousePointerClick className="size-3.5" /> Link opens
          </p>
          <p className="mt-1 font-display text-xl font-bold text-brand">
            {compact(totals.data?.link_opens ?? 0)}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Progress to target</span>
          <span>{percent}%</span>
        </div>
        <Progress value={percent} />
      </div>

      <CampaignLinks campaignId={campaign.id} />
    </section>
  );
}

function CampaignLinks({ campaignId }: { campaignId: string }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [teamId, setTeamId] = useState("");
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);

  const teams = useQuery({
    queryKey: ["campaign-link-teams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const links = useQuery({
    queryKey: ["campaign-links", campaignId],
    refetchInterval: 30000,
    queryFn: async (): Promise<CampaignLink[]> => {
      const { data, error } = await supabase
        .from("campaign_invites")
        .select("id,code,label,clicks,last_clicked_at,team_id")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CampaignLink[];
    },
  });

  const teamName = (id: string) => teams.data?.find((team) => team.id === id)?.name ?? "Team";
  const linkFor = (code: string) => `${window.location.origin}/j/${code}`;

  async function create() {
    const chosen = teamId || teams.data?.[0]?.id;
    if (!chosen) {
      toast.error("Add a team first, then create the link.");
      return;
    }
    setCreating(true);
    try {
      const code = Math.random().toString(36).slice(2, 10);
      const { error } = await supabase.from("campaign_invites").insert({
        campaign_id: campaignId,
        team_id: chosen,
        code,
        label: label.trim() || null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      setLabel("");
      await queryClient.invalidateQueries({ queryKey: ["campaign-links", campaignId] });
      await navigator.clipboard.writeText(linkFor(code)).catch(() => undefined);
      toast.success("Link created and copied.");
    } catch (error) {
      toast.error(
        error instanceof Error && error.message.includes("duplicate")
          ? "That team already has a link for this campaign."
          : error instanceof Error
            ? error.message
            : "Couldn't create the link.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function removeLink(id: string) {
    const { error } = await supabase.from("campaign_invites").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["campaign-links", campaignId] });
    toast.success("Link removed.");
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface/40 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-[11px] uppercase text-muted-foreground">Tracked link for</Label>
          <select
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
            value={teamId || teams.data?.[0]?.id || ""}
            onChange={(event) => setTeamId(event.target.value)}
          >
            {(teams.data ?? []).map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] uppercase text-muted-foreground">Note (optional)</Label>
          <Input
            className="h-9 w-40"
            maxLength={80}
            value={label}
            placeholder="Instagram batch"
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>
        <Button size="sm" className="h-9" onClick={create} disabled={creating}>
          <Plus className="mr-2 size-4" /> {creating ? "Creating…" : "Create link"}
        </Button>
      </div>

      {(links.data?.length ?? 0) === 0 ? (
        <p className="text-xs text-muted-foreground">
          No tracked links yet. Create one to count every open for this campaign.
        </p>
      ) : (
        <ul className="space-y-2">
          {links.data!.map((link) => (
            <li
              key={link.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background/60 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {teamName(link.team_id)}
                  {link.label ? ` · ${link.label}` : ""}
                </p>
                <p className="truncate text-xs text-muted-foreground">{linkFor(link.code)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {link.clicks.toLocaleString()} open{link.clicks === 1 ? "" : "s"}
                </Badge>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await navigator.clipboard.writeText(linkFor(link.code));
                    toast.success("Link copied.");
                  }}
                >
                  Copy
                </Button>
                <Button size="sm" variant="ghost" onClick={() => removeLink(link.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
