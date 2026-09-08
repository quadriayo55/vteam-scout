import { useEffect, useState } from "react";

export function LiveIndicator({ updatedAt }: { updatedAt: number | undefined }) {
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const seconds = updatedAt ? Math.max(0, Math.round((Date.now() - updatedAt) / 1000)) : null;

  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-2 animate-ping rounded-full bg-success opacity-70" />
        <span className="relative inline-flex size-2 rounded-full bg-success" />
      </span>
      {seconds === null ? "Connecting…" : `Last updated ${seconds}s ago`}
    </span>
  );
}
