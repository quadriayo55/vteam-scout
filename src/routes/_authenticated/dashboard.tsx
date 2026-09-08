import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth, useProfile, useRoles, displayNameOf } from "@/lib/auth";
import { dailyQuery, totalsQuery } from "@/lib/stats";
import { StatCard } from "@/components/StatCard";
import { SmartAnalytics } from "@/components/SmartAnalytics";
import { LiveIndicator } from "@/components/LiveIndicator";
import { Button } from "@/components/ui/button";
import { formatWatDay } from "@/lib/wat";
import { Link2, MousePointerClick, Clock, Target, Mail, Send, AlertTriangle, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Verunda Team Scoutier" },
      {
        name: "description",
        content: "Live outreach totals, clicks and scouted percentage for your Verunda account.",
      },
      { property: "og:title", content: "Dashboard — Verunda Team Scoutier" },
      { property: "og:description", content: "Live outreach totals, clicks and scouted percentage." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = useAuth();
  const profile = useProfile();
  const roles = useRoles();
  const totals = useQuery(totalsQuery({ userId: user?.id }, "all"));
  const daily = useQuery(dailyQuery({ userId: user?.id }, "7d"));
  const today = useQuery(totalsQuery({ userId: user?.id }, "today"));

  const emails = useQuery({
    queryKey: ["email-report", user?.id ?? null],
    enabled: Boolean(user?.id),
    refetchInterval: 20000,
    queryFn: async () => {
      const [total, todayRows, prepared, failed] = await Promise.all([
        supabase.rpc("email_sent_total"),
        supabase.rpc("email_sent_daily", { _days: 1 }),
        supabase
          .from("bulk_send_recipients")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user!.id),
        supabase
          .from("bulk_send_recipients")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user!.id)
          .eq("status", "failed"),
      ]);
      const sentToday = ((todayRows.data ?? []) as unknown as { sent: number }[]).reduce(
        (sum, row) => sum + Number(row.sent),
        0,
      );
      return {
        sent: Number(total.data ?? 0),
        sentToday,
        loaded: prepared.count ?? 0,
        failed: failed.count ?? 0,
      };
    },
  });

  const chartData = (daily.data ?? []).map((row) => ({
    day: formatWatDay(row.day).split(" ")[0],
    Generated: Number(row.total_gen),
    Clicked: Number(row.total_click),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand">
            {roles.isSuperAdmin ? "Admin" : roles.isTeamLeader ? "Team Leader" : "Member"}
          </p>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">
            Welcome back, {displayNameOf(profile.data, user?.email)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All figures are locked to West Africa Time.
          </p>
        </div>
        <LiveIndicator updatedAt={totals.dataUpdatedAt} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Links generated"
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

      <section className="panel space-y-3 p-4 sm:p-6">
        <div>
          <h2 className="font-display text-lg font-bold">Bulk email report</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Every lead you upload in Bulk Outreach and every email that goes out is counted here.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Leads uploaded"
            value={emails.data?.loaded ?? 0}
            icon={<Users className="size-4" />}
            loading={emails.isLoading}
          />
          <StatCard
            label="Emails sent"
            value={emails.data?.sent ?? 0}
            tone="brand"
            icon={<Mail className="size-4" />}
            loading={emails.isLoading}
          />
          <StatCard
            label="Sent today"
            value={emails.data?.sentToday ?? 0}
            tone="success"
            icon={<Send className="size-4" />}
            loading={emails.isLoading}
          />
          <StatCard
            label="Failed"
            value={emails.data?.failed ?? 0}
            icon={<AlertTriangle className="size-4" />}
            loading={emails.isLoading}
          />
        </div>
      </section>

      <section className="panel p-4 sm:p-6">
        <h2 className="font-display text-lg font-bold">Last 7 days</h2>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="gen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-chart-2)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--color-chart-2)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="clk" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-brand)" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="var(--color-brand)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                  color: "var(--color-foreground)",
                }}
              />
              <Area
                type="monotone"
                dataKey="Generated"
                stroke="var(--color-chart-2)"
                fill="url(#gen)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="Clicked"
                stroke="var(--color-brand)"
                fill="url(#clk)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel p-4 sm:p-6">
        <h2 className="font-display text-lg font-bold">Your usage</h2>
        <p className="mt-1 text-xs text-muted-foreground">What you have done so far today.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <StatCard label="Generated today" value={today.data?.generated ?? 0} loading={today.isLoading} />
          <StatCard label="Clicked today" value={today.data?.clicked ?? 0} tone="brand" loading={today.isLoading} />
          <StatCard label="Still to reach" value={today.data?.pending ?? 0} tone="success" loading={today.isLoading} />
        </div>
      </section>

      <SmartAnalytics userId={user?.id} />

      <section className="panel flex flex-wrap items-center justify-between gap-3 p-4 sm:p-6">
        <p className="text-sm text-muted-foreground">
          Upload a lead file to generate outreach links across every channel.
        </p>
        <Button asChild>
          <Link to="/outreach">Go to Outreach Links</Link>
        </Button>
      </section>
    </div>
  );
}
