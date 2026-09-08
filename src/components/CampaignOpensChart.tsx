import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { campaignOpensQuery } from "@/lib/stats";
import { Megaphone } from "lucide-react";

/** Compares how many link opens each campaign has driven. */
export function CampaignOpensChart() {
  const campaigns = useQuery(campaignOpensQuery());
  const rows = (campaigns.data ?? []).slice(0, 10);
  const best = Math.max(...rows.map((row) => row.opens), 0);

  return (
    <section className="panel p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-bold">Campaign link opens</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Which campaigns actually pull teams in.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {rows.length} campaign{rows.length === 1 ? "" : "s"}
        </p>
      </div>

      {campaigns.isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading campaigns…</p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <Megaphone className="size-6 text-brand" />
          <p className="text-sm text-muted-foreground">No campaigns to compare yet.</p>
        </div>
      ) : (
        <>
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  height={50}
                  tickFormatter={(value: string) =>
                    value.length > 14 ? `${value.slice(0, 13)}…` : value
                  }
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [`${value} opens`, "Link opens"]}
                />
                <Bar dataKey="opens" radius={[6, 6, 0, 0]}>
                  {rows.map((row) => (
                    <Cell
                      key={row.campaign_id}
                      fill={
                        row.opens === best && best > 0
                          ? "hsl(var(--brand))"
                          : "hsl(var(--muted-foreground))"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <ul className="mt-4 space-y-1 text-sm">
            {rows.map((row) => (
              <li
                key={row.campaign_id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface/50 px-3 py-2"
              >
                <span className="truncate font-semibold">{row.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {row.opens.toLocaleString()} opens · {row.teams_joined} team
                  {row.teams_joined === 1 ? "" : "s"} signed up ·{" "}
                  {row.clicked.toLocaleString()} of {row.generated.toLocaleString()} links clicked
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
