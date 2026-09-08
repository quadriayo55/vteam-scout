import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTimeZone, timeIn } from "@/lib/tz";
import { compact } from "@/lib/outreach";
import { Globe, Radio } from "lucide-react";

type DomainRow = { domain: string | null; generated: number; clicked: number };
type ActivityRow = {
  id: string;
  contact_name: string | null;
  contact_handle: string;
  channel: string;
  clicked_at: string;
};

export function SmartAnalytics({ userId }: { userId: string | undefined }) {
  const tz = useTimeZone();

  const domains = useQuery({
    queryKey: ["top-domains", userId ?? null],
    enabled: Boolean(userId),
    refetchInterval: 30000,
    queryFn: async (): Promise<DomainRow[]> => {
      const { data, error } = await supabase.rpc("outreach_top_domains", {
        _days: 30,
        _user_id: userId!,
        _limit: 8,
      });
      if (error) throw error;
      return (data ?? []) as unknown as DomainRow[];
    },
  });

  const activity = useQuery({
    queryKey: ["live-activity", userId ?? null],
    enabled: Boolean(userId),
    refetchInterval: 15000,
    queryFn: async (): Promise<ActivityRow[]> => {
      const { data, error } = await supabase
        .from("outreach_links")
        .select("id, contact_name, contact_handle, channel, clicked_at")
        .eq("user_id", userId!)
        .not("clicked_at", "is", null)
        .order("clicked_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as ActivityRow[];
    },
  });

  const top = (domains.data ?? []).filter((row) => row.domain);
  const max = Math.max(1, ...top.map((row) => Number(row.generated)));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="panel p-4 sm:p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <Globe className="size-4 text-brand" /> Top domains
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">Last 30 days, by links generated.</p>
        <ul className="mt-4 space-y-3">
          {top.length === 0 && (
            <li className="text-sm text-muted-foreground">
              Nothing yet — generate outreach links and your busiest domains show up here.
            </li>
          )}
          {top.map((row) => (
            <li key={row.domain}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-semibold">{row.domain}</span>
                <span className="shrink-0 text-muted-foreground">
                  {compact(Number(row.generated))} · {compact(Number(row.clicked))} clicked
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${(Number(row.generated) / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel p-4 sm:p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <Radio className="size-4 text-brand" /> Live activity
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Times shown in your timezone ({tz.replace("_", " ")}).
        </p>
        <ul className="mt-4 space-y-2.5">
          {(activity.data ?? []).length === 0 && (
            <li className="text-sm text-muted-foreground">No opens recorded yet.</li>
          )}
          {(activity.data ?? []).map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface/50 px-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">
                  {row.contact_name || row.contact_handle}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {row.channel} · {row.contact_handle}
                </span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {timeIn(tz, row.clicked_at)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
