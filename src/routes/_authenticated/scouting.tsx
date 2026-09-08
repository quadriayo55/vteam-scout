import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useRoles } from "@/lib/auth";
import { LiveIndicator } from "@/components/LiveIndicator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Trash2, Star, Building2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/scouting")({
  head: () => ({
    meta: [
      { title: "Prospect Scouting — Verunda Team Scoutier" },
      {
        name: "description",
        content:
          "List scouted prospects with contacts and a fit score, then assign them to a scout and a campaign.",
      },
      { property: "og:title", content: "Prospect Scouting — Verunda Team Scoutier" },
      {
        property: "og:description",
        content: "Score prospects and assign them to scouts and campaigns.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ScoutingPage,
});

const STAGES = ["new", "contacted", "replied", "won", "lost"] as const;
type Stage = (typeof STAGES)[number];

const STAGE_LABELS: Record<Stage, string> = {
  new: "New",
  contacted: "Contacted",
  replied: "Replied",
  won: "Won",
  lost: "Lost",
};

type Prospect = {
  id: string;
  business_name: string;
  website: string | null;
  country: string | null;
  notes: string | null;
  email: string | null;
  phone: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  linkedin: string | null;
  score: number;
  stage: string;
  team_id: string | null;
  assigned_to: string | null;
  campaign_id: string | null;
  created_at: string;
};

const EMPTY = {
  business_name: "",
  website: "",
  country: "",
  notes: "",
  email: "",
  phone: "",
  instagram: "",
  facebook: "",
  tiktok: "",
  linkedin: "",
  score: "60",
  stage: "new" as Stage,
  assigned_to: "",
  campaign_id: "",
};

function ScoutingPage() {
  const { user } = useAuth();
  const { isSuperAdmin } = useRoles();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<"all" | Stage>("all");
  const [openForm, setOpenForm] = useState(false);


  const people = useQuery({
    queryKey: ["scouting-people"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,display_name,email,team_id")
        .order("display_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const campaigns = useQuery({
    queryKey: ["scouting-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id,name")
        .order("starts_on", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const prospects = useQuery({
    queryKey: ["prospects"],
    refetchInterval: 30000,
    queryFn: async (): Promise<Prospect[]> => {
      const { data, error } = await supabase
        .from("prospects")
        .select("*")
        .order("score", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Prospect[];
    },
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (prospects.data ?? []).filter((row) => {
      if (stageFilter !== "all" && row.stage !== stageFilter) return false;
      if (!term) return true;
      return [row.business_name, row.website, row.country, row.email, row.instagram]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [prospects.data, search, stageFilter]);

  const personName = (id: string | null) =>
    people.data?.find((person) => person.id === id)?.display_name ?? "Nobody yet";
  const campaignName = (id: string | null) =>
    campaigns.data?.find((campaign) => campaign.id === id)?.name ?? null;

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["prospects"] });
  }

  async function update(id: string, patch: Partial<Prospect>) {
    const { error } = await supabase
      .from("prospects")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    else refresh();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("prospects").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Prospect removed.");
      refresh();
    }
  }

  const won = rows.filter((row) => row.stage === "won").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Prospect Scouting</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length} prospect{rows.length === 1 ? "" : "s"} listed · {won} won
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LiveIndicator updatedAt={prospects.dataUpdatedAt} />
          <Button size="sm" onClick={() => setOpenForm((v) => !v)}>
            <Plus className="mr-2 size-4" /> Add prospect
          </Button>
        </div>
      </div>

      {openForm && (
        <NewProspectForm
          people={people.data ?? []}
          campaigns={campaigns.data ?? []}
          userId={user?.id ?? null}
          onDone={() => {
            setOpenForm(false);
            refresh();
          }}
        />
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search name, website, country, email…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select value={stageFilter} onValueChange={(value) => setStageFilter(value as Stage | "all")}>
          <SelectTrigger>
            <SelectValue placeholder="Any stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any stage</SelectItem>
            {STAGES.map((stage) => (
              <SelectItem key={stage} value={stage}>
                {STAGE_LABELS[stage]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {prospects.isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading prospects…</p>
      ) : rows.length === 0 ? (
        <section className="panel flex flex-col items-center gap-3 p-10 text-center">
          <Building2 className="size-6 text-brand" />
          <p className="text-sm text-muted-foreground">
            No prospects here yet — add the first business you want to reach.
          </p>
        </section>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-display text-base font-bold">
                      {row.business_name}
                    </h2>
                    <Badge variant={row.stage === "won" ? "default" : "secondary"}>
                      {STAGE_LABELS[(row.stage as Stage) ?? "new"] ?? row.stage}
                    </Badge>
                    <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                      <Star className="size-3.5 text-brand" /> {row.score}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[
                      row.website,
                      row.country,
                      row.email,
                      row.phone,
                      row.instagram && `IG ${row.instagram}`,
                      row.facebook && `FB ${row.facebook}`,
                      row.tiktok && `TikTok ${row.tiktok}`,
                      row.linkedin && `LinkedIn ${row.linkedin}`,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No contact details yet"}
                  </p>
                  {row.notes && <p className="mt-1 text-sm">{row.notes}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {personName(row.assigned_to)}
                    {campaignName(row.campaign_id) ? ` · ${campaignName(row.campaign_id)}` : ""}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={row.stage}
                    onValueChange={(value) => update(row.id, { stage: value })}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAGES.map((stage) => (
                        <SelectItem key={stage} value={stage}>
                          {STAGE_LABELS[stage]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={row.assigned_to ?? "none"}
                    onValueChange={(value) =>
                      update(row.id, { assigned_to: value === "none" ? null : value })
                    }
                  >
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="Assign person" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nobody</SelectItem>
                      {(people.data ?? []).map((person) => (
                        <SelectItem key={person.id} value={person.id}>
                          {person.display_name || person.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(isSuperAdmin || row.assigned_to === user?.id) && (
                    <Button variant="ghost" size="icon" onClick={() => remove(row.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewProspectForm({
  people,
  campaigns,
  userId,
  onDone,
}: {
  people: { id: string; display_name: string; email: string }[];
  campaigns: { id: string; name: string }[];
  userId: string | null;
  onDone: () => void;
}) {
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof EMPTY, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function save() {
    if (!form.business_name.trim()) {
      toast.error("Give the business a name.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("prospects").insert({
        business_name: form.business_name.trim(),
        website: form.website.trim() || null,
        country: form.country.trim() || null,
        notes: form.notes.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        instagram: form.instagram.trim() || null,
        facebook: form.facebook.trim() || null,
        tiktok: form.tiktok.trim() || null,
        linkedin: form.linkedin.trim() || null,
        score: Math.min(100, Math.max(0, Number(form.score) || 0)),
        stage: form.stage,
        assigned_to: form.assigned_to || null,
        campaign_id: form.campaign_id || null,
        created_by: userId,
      });
      if (error) throw error;
      toast.success("Prospect added.");
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save that prospect.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel space-y-4 p-4 sm:p-6">
      <h2 className="font-display text-lg font-bold">New prospect</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Business name" value={form.business_name} onChange={(v) => set("business_name", v)} />
        <Field label="Website / domain" value={form.website} onChange={(v) => set("website", v)} />
        <Field label="Country" value={form.country} onChange={(v) => set("country", v)} />
        <Field label="Email" value={form.email} onChange={(v) => set("email", v)} />
        <Field label="WhatsApp / phone" value={form.phone} onChange={(v) => set("phone", v)} />
        <Field label="Fit score (0-100)" value={form.score} onChange={(v) => set("score", v)} type="number" />
        <Field label="Instagram" value={form.instagram} onChange={(v) => set("instagram", v)} />
        <Field label="Facebook" value={form.facebook} onChange={(v) => set("facebook", v)} />
        <Field label="TikTok" value={form.tiktok} onChange={(v) => set("tiktok", v)} />
        <Field label="LinkedIn" value={form.linkedin} onChange={(v) => set("linkedin", v)} />
        <div className="space-y-2">
          <Label>Stage</Label>
          <Select value={form.stage} onValueChange={(value) => set("stage", value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAGES.map((stage) => (
                <SelectItem key={stage} value={stage}>
                  {STAGE_LABELS[stage]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Scout</Label>
          <Select
            value={form.assigned_to || "none"}
            onValueChange={(value) => set("assigned_to", value === "none" ? "" : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Nobody" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nobody</SelectItem>
              {people.map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {person.display_name || person.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Campaign</Label>
          <Select
            value={form.campaign_id || "none"}
            onValueChange={(value) => set("campaign_id", value === "none" ? "" : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="No campaign" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No campaign</SelectItem>
              {campaigns.map((campaign) => (
                <SelectItem key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 sm:col-span-3">
          <Label htmlFor="p-notes">Notes</Label>
          <Textarea
            id="p-notes"
            rows={2}
            value={form.notes}
            onChange={(event) => set("notes", event.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save prospect"}
        </Button>
        <Button variant="secondary" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
