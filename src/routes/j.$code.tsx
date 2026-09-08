import { createFileRoute, Link } from "@tanstack/react-router";
import { recordInviteClick } from "@/lib/invites.functions";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle } from "lucide-react";

type LoaderResult = {
  ok: boolean;
  campaignName?: string | undefined;
  teamName?: string | undefined;
  clicks?: number | undefined;
};

export const Route = createFileRoute("/j/$code")({
  loader: async ({ params }): Promise<LoaderResult> => {
    try {
      return await recordInviteClick({ data: { code: params.code } });
    } catch (error) {
      console.error(error);
      return { ok: false };
    }
  },
  head: () => ({
    meta: [
      { title: "Campaign sign-up — Verunda Team Scoutier" },
      {
        name: "description",
        content:
          "Open a Verunda team outreach link to sign your team up for the campaign and record the open.",
      },
      { property: "og:title", content: "Campaign sign-up — Verunda Team Scoutier" },
      {
        property: "og:description",
        content: "Your team is signed up for this outreach campaign.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: JoinPage,
  errorComponent: JoinError,
  notFoundComponent: JoinError,
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <section className="panel flex max-w-md flex-col items-center gap-3 p-8 text-center">
        <Logo compact />
        {children}
        <Button asChild className="mt-2">
          <Link to="/dashboard">Open the dashboard</Link>
        </Button>
      </section>
    </main>
  );
}

function JoinError() {
  return (
    <Shell>
      <AlertTriangle className="size-8 text-brand" />
      <h1 className="font-display text-xl font-bold">Link not recognised</h1>
      <p className="text-sm text-muted-foreground">
        This outreach link is no longer active. Ask your team leader for a fresh one.
      </p>
    </Shell>
  );
}


function JoinPage() {
  const result = Route.useLoaderData();

  if (!result.ok) {
    return (
      <Shell>
        <AlertTriangle className="size-8 text-brand" />
        <h1 className="font-display text-xl font-bold">Link not recognised</h1>
        <p className="text-sm text-muted-foreground">
          This outreach link is no longer active. Ask your team leader for a fresh one.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <CheckCircle2 className="size-8 text-success" />
      <h1 className="font-display text-xl font-bold">{result.teamName} is signed up</h1>
      <p className="text-sm text-muted-foreground">
        This open was recorded for <span className="font-semibold">{result.campaignName}</span>.
        That's {result.clicks?.toLocaleString()} open{result.clicks === 1 ? "" : "s"} on this link so
        far.
      </p>
    </Shell>
  );
}
