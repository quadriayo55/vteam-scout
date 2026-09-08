import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { compact } from "@/lib/outreach";
import { Flame, Calendar, Mail, Award } from "lucide-react";

type DayRow = { day: string; sent: number };

const ACHIEVEMENTS: { label: string; kind: "streak" | "sent"; need: number }[] = [
  { label: "3-Day Streak", kind: "streak", need: 3 },
  { label: "7-Day Streak", kind: "streak", need: 7 },
  { label: "14-Day Streak", kind: "streak", need: 14 },
  { label: "30-Day Streak", kind: "streak", need: 30 },
  { label: "50 Emails", kind: "sent", need: 50 },
  { label: "100 Emails", kind: "sent", need: 100 },
  { label: "500 Emails", kind: "sent", need: 500 },
  { label: "1,000 Emails", kind: "sent", need: 1000 },
  { label: "2,000 Emails", kind: "sent", need: 2000 },
  { label: "50,000 Emails", kind: "sent", need: 50000 },
];

function lagosToday() {
  const now = new Date();
  return new Date(now.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

function dayBefore(iso: string, back: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - back);
  return date.toISOString().slice(0, 10);
}

export function StreaksBadges({ userId }: { userId: string | undefined }) {
  const daily = useQuery({
    queryKey: ["email-sent-daily", userId ?? null],
    enabled: Boolean(userId),
    refetchInterval: 60000,
    queryFn: async (): Promise<DayRow[]> => {
      const { data, error } = await supabase.rpc("email_sent_daily", { _days: 120 });
      if (error) throw error;
      return ((data ?? []) as unknown as { day: string; sent: number }[]).map((row) => ({
        day: row.day,
        sent: Number(row.sent),
      }));
    },
  });

  const total = useQuery({
    queryKey: ["email-sent-total", userId ?? null],
    enabled: Boolean(userId),
    refetchInterval: 60000,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("email_sent_total");
      if (error) throw error;
      return Number(data ?? 0);
    },
  });

  const stats = useMemo(() => {
    const rows = daily.data ?? [];
    const byDay = new Map(rows.map((row) => [row.day, row.sent]));
    const today = lagosToday();

    let streak = 0;
    for (let back = 0; back < 120; back += 1) {
      const key = dayBefore(today, back);
      const count = byDay.get(key) ?? 0;
      if (count > 0) streak += 1;
      else if (back > 0 || streak > 0) break;
      else break;
    }

    let best = 0;
    let run = 0;
    for (let back = 119; back >= 0; back -= 1) {
      const count = byDay.get(dayBefore(today, back)) ?? 0;
      if (count > 0) {
        run += 1;
        best = Math.max(best, run);
      } else {
        run = 0;
      }
    }

    let week = 0;
    for (let back = 0; back < 7; back += 1) week += byDay.get(dayBefore(today, back)) ?? 0;

    return { streak, best, week, today: byDay.get(today) ?? 0 };
  }, [daily.data]);

  const allTime = total.data ?? 0;

  return (
    <section className="panel p-4 sm:p-6">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold">
        <Flame className="size-4 text-brand" /> Streaks &amp; badges
      </h2>

      <div className="mt-4 flex justify-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-4 py-2 text-sm font-bold text-brand">
          <Flame className="size-4" />
          {stats.streak > 0
            ? `${stats.streak}-day sending streak`
            : "No streak yet — send today to start one"}
        </span>
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <Row icon={<Calendar className="size-3.5" />} label="Sent today" value={stats.today} />
        <Row icon={<Calendar className="size-3.5" />} label="This week" value={stats.week} />
        <Row icon={<Mail className="size-3.5" />} label="All time" value={allTime} />
        <Row icon={<Award className="size-3.5" />} label="Best streak" value={stats.best} suffix=" days" />
      </dl>

      <p className="mt-5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Achievements
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {ACHIEVEMENTS.map((item) => {
          const earned = item.kind === "streak" ? stats.best >= item.need : allTime >= item.need;
          return (
            <li
              key={item.label}
              className={
                earned
                  ? "rounded-xl border border-brand/40 bg-brand/10 px-2 py-3 text-center text-[11px] font-bold text-brand"
                  : "rounded-xl border border-border bg-muted/30 px-2 py-3 text-center text-[11px] font-semibold text-muted-foreground/60"
              }
            >
              <Award className="mx-auto mb-1 size-4" />
              {item.label}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Row({
  icon,
  label,
  value,
  suffix = "",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-surface/50 px-3 py-2">
      <dt className="flex items-center gap-2 text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="font-bold tabular-nums">
        {compact(value)}
        {suffix}
      </dd>
    </div>
  );
}
