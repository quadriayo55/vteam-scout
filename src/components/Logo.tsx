import { cn } from "@/lib/utils";
import lockupAsset from "@/assets/verunda-lockup.png.asset.json";
import markAsset from "@/assets/verunda-mark.png.asset.json";

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  if (compact) {
    return (
      <span className={cn("flex items-center", className)}>
        <img
          src={markAsset.url}
          alt="Verunda Team Scoutier"
          className="h-9 w-auto shrink-0 object-contain"
        />
      </span>
    );
  }

  return (
    <span className={cn("flex flex-col items-start gap-1", className)}>
      <img
        src={lockupAsset.url}
        alt="Verunda"
        className="h-6 w-auto object-contain object-left"
      />
      <span className="pl-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        Team Scoutier
      </span>
    </span>
  );
}
