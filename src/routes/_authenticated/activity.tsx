import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { activityQuery, type ActivityRow } from "@/lib/stats";
import { LiveIndicator } from "@/components/LiveIndicator";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatWat } from "@/lib/wat";
import { Users, MousePointerClick, Send, AlertTriangle, History } from "lucide-react";
import { RoleGate } from "@/components/RoleGate";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({
    meta: [
      { title: "Activity Log — Verunda Team Scoutier" },
      {
        name: "description",
        content:
          "A traceable log of every team sign-up, campaign link open and email sent, newest first, so stalled campaigns are easy to spot.",
      },
      { property: "og:title", content: "Activity Log — Verunda Team Scoutier" },
      {
        property: "og:description",
        content: "Trace team sign-ups, link opens and emails sent in one timeline.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RoleGate need="seeEveryonesStats">
      <ActivityPage />
    </RoleGate>
  ),
});

const KINDS = {
  team_joined: { label: "Team signed up", icon: Users },
  link_open: { label: "Link opened", icon: MousePointerClick },
  email_sent: { label: "Email sent", icon: Send },
  email_failed: { label: "Email failed", icon: AlertTriangle },
} as const;

function ActivityPage() {
  const [campaignId, setCampaignId] = useState("all");
  const [kind, setKind] = useState<"all" | keyof typeof KINDS>("all");

  const campaigns = useQuery({
    queryKey: ["activity-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id,name")
        .order("starts_on", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const feed = useQuery(activityQuery(200, campaignId === "all" ? null : campaignId));

  const rows = useMemo(
    () => (feed.data ?? []).filter((row) => kind === "all" || row.kind === kind),
    [feed.data, kind],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Activity Log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything that happened, newest first — times in West Africa Time.
          </p>
        </div>
        <LiveIndicator updatedAt={feed.dataUpdatedAt} />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Select value={campaignId} onValueChange={setCampaignId}>
          <SelectTrigger>
            <SelectValue placeholder="All campaigns" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All campaigns</SelectItem>
            {(campaigns.data ?? []).map((campaign) => (
              <SelectItem key={campaign.id} value={campaign.id}>
                {campaign.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={kind} onValueChange={(value) => setKind(value as typeof kind)}>
          <SelectTrigger>
            <SelectValue placeholder="Everything" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everything</SelectItem>
            {Object.entries(KINDS).map(([key, value]) => (
              <SelectItem key={key} value={key}>
                {value.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {feed.isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading activity…</p>
      ) : rows.length === 0 ? (
        <section className="panel flex flex-col items-center gap-3 p-10 text-center">
          <History className="size-6 text-brand" />
          <p className="text-sm text-muted-foreground">
            Nothing recorded for this filter yet.
          </p>
        </section>
      ) : (
        <ol className="panel divide-y divide-border">
          {rows.map((row, index) => (
            <Entry key={`${row.kind}-${row.happened_at}-${index}`} row={row} />
          ))}
        </ol>
      )}
    </div>
  );
}

function Entry({ row }: { row: ActivityRow }) {
  const meta = KINDS[row.kind] ?? KINDS.link_open;
  const Icon = meta.icon;
  return (
    <li className="flex items-start gap-3 p-4">
      <span className="mt-0.5 rounded-lg bg-surface p-2 text-brand">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold">{row.title}</p>
          <Badge variant={row.kind === "email_failed" ? "destructive" : "secondary"}>
            {meta.label}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {[row.campaign_name, row.team_name, row.detail].filter(Boolean).join(" · ")}
        </p>
      </div>
      <span className="whitespace-nowrap text-xs text-muted-foreground">
        {formatWat(row.happened_at)}
      </span>
    </li>
  );
}
