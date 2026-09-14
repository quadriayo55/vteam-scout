import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTimeZone, formatIn } from "@/lib/tz";
import { RoleGate } from "@/components/RoleGate";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, MailCheck, MousePointerClick, Eye, Reply, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/email-reports")({
  head: () => ({
    meta: [
      { title: "Email Reports — Verunda Team Scoutier" },
      {
        name: "description",
        content:
          "See how every emailed list performed: delivered, opened, clicked, replied and bounced, person by person.",
      },
      { property: "og:title", content: "Email Reports — Verunda Team Scoutier" },
      {
        property: "og:description",
        content: "Delivery, opens, clicks and replies for every list you emailed.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RoleGate need="sendBulkEmail">
      <EmailReportsPage />
    </RoleGate>
  ),
});

type RecipientRow = {
  id: string;
  email: string;
  contact_name: string | null;
  brand: string | null;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
  first_open_at: string | null;
  open_count: number;
  first_click_at: string | null;
  click_count: number;
  replied_at: string | null;
};

function percent(part: number, whole: number) {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

function EmailReportsPage() {
  const { user } = useAuth();
  const tz = useTimeZone();
  const [sendId, setSendId] = useState("");
  const [search, setSearch] = useState("");

  const sends = useQuery({
    queryKey: ["bulk-sends-report", user?.id ?? null],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bulk_sends")
        .select("id,name,subject,total,sent,failed,status,source_files,created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const chosenId = sendId || sends.data?.[0]?.id || "";
  const chosen = (sends.data ?? []).find((item) => item.id === chosenId);

  const rows = useQuery({
    queryKey: ["bulk-report-rows", chosenId],
    enabled: Boolean(chosenId),
    refetchInterval: 30000,
    queryFn: async (): Promise<RecipientRow[]> => {
      const { data, error } = await supabase
        .from("bulk_send_recipients")
        .select(
          "id,email,contact_name,brand,status,sent_at,delivered_at,bounced_at,complained_at,first_open_at,open_count,first_click_at,click_count,replied_at",
        )
        .eq("send_id", chosenId)
        .order("created_at", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as RecipientRow[];
    },
  });

  const summary = useMemo(() => {
    const list = rows.data ?? [];
    const sent = list.filter((row) => row.status === "sent").length;
    return {
      sent,
      delivered: list.filter((row) => row.delivered_at).length,
      opened: list.filter((row) => row.first_open_at).length,
      clicked: list.filter((row) => row.first_click_at).length,
      replied: list.filter((row) => row.replied_at).length,
      bounced: list.filter((row) => row.bounced_at || row.complained_at).length,
    };
  }, [rows.data]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows.data ?? [];
    return (rows.data ?? []).filter((row) =>
      `${row.email} ${row.contact_name ?? ""} ${row.brand ?? ""}`.toLowerCase().includes(needle),
    );
  }, [rows.data, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Email Reports</h1>
        <p className="text-sm text-muted-foreground">
          How each list you emailed actually performed, person by person.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>List</Label>
          <select
            value={chosenId}
            onChange={(event) => setSendId(event.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
          >
            {(sends.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} — {item.sent}/{item.total} sent
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Find a person</Label>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Email, name or brand"
          />
        </div>
      </div>

      {chosen && (
        <p className="text-xs text-muted-foreground">
          {chosen.subject} · started {formatIn(tz, chosen.created_at)}
          {Array.isArray(chosen.source_files) && chosen.source_files.length > 0
            ? ` · from ${(chosen.source_files as unknown[]).join(", ")}`
            : ""}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Delivered"
          value={summary.delivered}
          suffix={`  ${percent(summary.delivered, summary.sent)}%`}
          icon={<MailCheck className="size-4" />}
          tone="success"
        />
        <StatCard
          label="Opened"
          value={summary.opened}
          suffix={`  ${percent(summary.opened, summary.sent)}%`}
          icon={<Eye className="size-4" />}
          tone="brand"
        />
        <StatCard
          label="Clicked"
          value={summary.clicked}
          suffix={`  ${percent(summary.clicked, summary.sent)}%`}
          icon={<MousePointerClick className="size-4" />}
        />
        <StatCard
          label="Replied"
          value={summary.replied}
          suffix={`  ${percent(summary.replied, summary.sent)}%`}
          icon={<Reply className="size-4" />}
        />
        <StatCard
          label="Bounced"
          value={summary.bounced}
          icon={<AlertTriangle className="size-4" />}
          tone="muted"
        />
      </div>

      <section className="space-y-2">
        {rows.isLoading && <Loader2 className="size-5 animate-spin text-brand" />}
        {!rows.isLoading && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing to show for this list yet.</p>
        )}
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-surface/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Person</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Opens</th>
                <th className="px-3 py-2">Clicks</th>
                <th className="px-3 py-2">Replied</th>
                <th className="px-3 py-2">Sent</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 300).map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <span className="block font-medium">{row.contact_name || row.email}</span>
                    <span className="block text-xs text-muted-foreground">
                      {row.brand || row.email}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={
                        row.bounced_at || row.complained_at || row.status === "failed"
                          ? "destructive"
                          : row.delivered_at
                            ? "default"
                            : "secondary"
                      }
                    >
                      {row.bounced_at
                        ? "bounced"
                        : row.complained_at
                          ? "complained"
                          : row.delivered_at
                            ? "delivered"
                            : row.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{row.open_count}</td>
                  <td className="px-3 py-2 tabular-nums">{row.click_count}</td>
                  <td className="px-3 py-2 text-xs">
                    {row.replied_at ? formatIn(tz, row.replied_at) : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {row.sent_at ? formatIn(tz, row.sent_at) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 300 && (
          <p className="text-xs text-muted-foreground">
            Showing the first 300 of {filtered.length.toLocaleString()} people.
          </p>
        )}
      </section>
    </div>
  );
}
