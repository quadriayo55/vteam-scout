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

function CampaignCard({ campaign, canDelete }: { campaign: Campaign; canDelete: boolean }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState(String(campaign.target ?? 0));

  const totals = useQuery({
    queryKey: ["campaign-totals", campaign.id],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("campaign_totals", { _campaign_id: campaign.id });
      if (error) throw error;
      const row = (data as { generated: number; clicked: number }[] | null)?.[0];
      return {
        generated: Number(row?.generated ?? 0),
        clicked: Number(row?.clicked ?? 0),
      };
    },
  });

  const generated = totals.data?.generated ?? 0;
  const clicked = totals.data?.clicked ?? 0;
  const percent = campaign.target ? Math.min(100, Math.round((generated / campaign.target) * 100)) : 0;

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
              {campaign.is_active ? "Active" : "Paused"}
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
        {canDelete && (
          <Button variant="ghost" size="sm" onClick={remove}>
            <Trash2 className="mr-2 size-4" /> Delete
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
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
          <p className="text-[11px] uppercase text-muted-foreground">Generated</p>
          <p className="mt-1 font-display text-xl font-bold">{compact(generated)}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface/50 p-3">
          <p className="flex items-center gap-1.5 text-[11px] uppercase text-muted-foreground">
            <MousePointerClick className="size-3.5" /> Clicked
          </p>
          <p className="mt-1 font-display text-xl font-bold text-brand">{compact(clicked)}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Progress to target</span>
          <span>{percent}%</span>
        </div>
        <Progress value={percent} />
      </div>
    </section>
  );
}
