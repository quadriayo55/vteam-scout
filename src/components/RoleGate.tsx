import { Link } from "@tanstack/react-router";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/lib/auth";
import type { ReactNode } from "react";

type Permission = "manageCampaigns" | "manageProspects" | "seeEveryonesStats" | "sendBulkEmail" | "manageConnections" | "manageMembers";

export function RoleGate({ need, children }: { need: Permission; children: ReactNode }) {
  const permissions = usePermissions();

  if (permissions.loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-brand" />
      </div>
    );
  }

  if (!permissions[need]) {
    return (
      <section className="panel mx-auto flex max-w-md flex-col items-center gap-3 p-10 text-center">
        <Lock className="size-6 text-muted-foreground" />
        <h1 className="font-display text-lg font-bold">Not available on your account</h1>
        <p className="text-sm text-muted-foreground">
          You're signed in as a {permissions.roleLabel}. Ask an admin if you need access to this
          part of the workspace.
        </p>
        <Button asChild size="sm">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </section>
    );
  }

  return <>{children}</>;
}
