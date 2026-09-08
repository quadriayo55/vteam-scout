import { cn } from "@/lib/utils";
import { Crosshair } from "lucide-react";

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-lg shadow-brand/25">
        <Crosshair className="size-5" strokeWidth={2.4} />
      </span>
      {!compact && (
        <span className="leading-none">
          <span className="block font-display text-[15px] font-bold tracking-tight">
            Verunda
          </span>
          <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Team Scoutier
          </span>
        </span>
      )}
    </span>
  );
}
