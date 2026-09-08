import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { compact } from "@/lib/outreach";

export function StatCard({
  label,
  value,
  suffix,
  icon,
  tone = "default",
  loading,
}: {
  label: string;
  value: number;
  suffix?: string;
  icon?: ReactNode;
  tone?: "default" | "brand" | "success" | "muted";
  loading?: boolean;
}) {
  const toneClass = {
    default: "text-foreground",
    brand: "text-brand",
    success: "text-success",
    muted: "text-muted-foreground",
  }[tone];

  return (
    <div className="panel p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
        {icon && <span className={cn("opacity-80", toneClass)}>{icon}</span>}
      </div>
      <p className={cn("mt-3 font-display text-3xl font-bold tabular-nums sm:text-4xl", toneClass)}>
        {loading ? "—" : compact(value)}
        {suffix && !loading && <span className="text-xl">{suffix}</span>}
      </p>
    </div>
  );
}
