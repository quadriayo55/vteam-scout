import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { dailyQuery, totalsQuery, RANGE_LABELS, type Range } from "@/lib/stats";
import { StatCard } from "@/components/StatCard";
import { LiveIndicator } from "@/components/LiveIndicator";
import { formatWatDay } from "@/lib/wat";
import { Link2, MousePointerClick, Clock, Target } from "lucide-react";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Verunda Team Scoutier" },
      {
        name: "description",
        content: "Time-bounded outreach analytics by day and channel, locked to West Africa Time.",
      },
      { property: "og:title", content: "Analytics — Verunda Team Scoutier" },
      { property: "og:description", content: "Time-bounded outreach analytics by day and channel." },
    ],
  }),
  component: AnalyticsPage,
});

const RANGES: Range[] = ["today", "7d", "30d"];

function AnalyticsPage() {
  const { user } = useAuth();
  const [range, setRange] = useState<Range>("7d");
  const totals = useQuery(totalsQuery({ userId: user?.id }, range));
  const daily = useQuery(dailyQuery({ userId: user?.id }, range));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every calendar day is represented, even with zero activity (WAT).
          </p>
        </div>
        <LiveIndicator updatedAt={totals.dataUpdatedAt} />
      </div>

      <div className="flex flex-wrap gap-2">
        {RANGES.map((option) => (
          <button
            key={option}
            onClick={() => setRange(option)}
            className={
              range === option
                ? "rounded-full bg-brand px-4 py-2 text-xs font-bold text-brand-foreground"
                : "rounded-full border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
            }
          >
            {RANGE_LABELS[option]}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Generated"
          value={totals.data?.generated ?? 0}
          icon={<Link2 className="size-4" />}
          loading={totals.isLoading}
        />
        <StatCard
          label="Clicked"
          value={totals.data?.clicked ?? 0}
          tone="brand"
          icon={<MousePointerClick className="size-4" />}
          loading={totals.isLoading}
        />
        <StatCard
          label="Pending"
          value={totals.data?.pending ?? 0}
          tone="success"
          icon={<Clock className="size-4" />}
          loading={totals.isLoading}
        />
        <StatCard
          label="Scouted"
          value={totals.data?.percent ?? 0}
          suffix="%"
          icon={<Target className="size-4" />}
          loading={totals.isLoading}
        />
      </div>

      <section className="panel overflow-hidden">
        <h2 className="p-4 font-display text-lg font-bold sm:p-6 sm:pb-4">Daily breakdown</h2>

        {/* Mobile cards */}
        <div className="space-y-2 px-4 pb-4 sm:hidden">
          {(daily.data ?? []).map((row) => (
            <div key={row.day} className="rounded-xl border border-border bg-surface/50 p-3">
              <p className="text-sm font-bold">{formatWatDay(row.day)}</p>
              <dl className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                <dt>Email</dt>
                <dd className="text-right text-foreground">
                  {row.email_gen} gen / {row.email_click} clicked
                </dd>
                <dt>WhatsApp</dt>
                <dd className="text-right text-foreground">
                  {row.whatsapp_gen} gen / {row.whatsapp_click} clicked
                </dd>
                <dt>Social</dt>
                <dd className="text-right text-foreground">
                  {row.social_gen} gen / {row.social_click} clicked
                </dd>
                <dt className="font-bold">Total</dt>
                <dd className="text-right font-bold text-foreground">
                  {row.total_gen} gen / {row.total_click} clicked
                </dd>
              </dl>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead className="border-y border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-6 py-3">Date</th>
                <th className="px-3 py-3">Email gen</th>
                <th className="px-3 py-3">Email click</th>
                <th className="px-3 py-3">WA gen</th>
                <th className="px-3 py-3">WA click</th>
                <th className="px-3 py-3">Social gen</th>
                <th className="px-3 py-3">Social click</th>
                <th className="px-6 py-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {(daily.data ?? []).map((row) => (
                <tr key={row.day} className="border-b border-border/60 tabular-nums">
                  <td className="px-6 py-3 font-semibold">{formatWatDay(row.day)}</td>
                  <td className="px-3 py-3">{row.email_gen}</td>
                  <td className="px-3 py-3">{row.email_click}</td>
                  <td className="px-3 py-3">{row.whatsapp_gen}</td>
                  <td className="px-3 py-3">{row.whatsapp_click}</td>
                  <td className="px-3 py-3">{row.social_gen}</td>
                  <td className="px-3 py-3">{row.social_click}</td>
                  <td className="px-6 py-3 font-bold">
                    {row.total_gen} / {row.total_click}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
