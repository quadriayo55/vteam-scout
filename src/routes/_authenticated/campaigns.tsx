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

