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
    <span className={cn("flex items-center gap-2.5", className)}>
      <img
        src={markAsset.url}
        alt=""
        aria-hidden="true"
        className="h-9 w-auto shrink-0 object-contain"
      />
      <span className="leading-none">
        <img
          src={lockupAsset.url}
          alt="Verunda"
          className="block h-[15px] w-auto object-contain object-left"
          style={{ clipPath: "inset(0 0 0 20%)" }}
        />
        <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Team Scoutier
        </span>
      </span>
    </span>
  );
}
