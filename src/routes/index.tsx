import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Mail, MessageCircle, Share2, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Verunda Team Scoutier — One-click outreach at scale" },
      {
        name: "description",
        content:
          "Upload lead files and generate one-click outreach links across email, WhatsApp, Facebook, Instagram, TikTok and LinkedIn, with live team analytics.",
      },
      { property: "og:title", content: "Verunda Team Scoutier — One-click outreach at scale" },
      {
        property: "og:description",
        content:
          "Upload lead files and generate one-click outreach links across every channel, with live team analytics.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: Mail, title: "Email at scale", body: "Pre-filled subject and body, personalised per lead." },
  { icon: MessageCircle, title: "Validated WhatsApp", body: "Numbers checked before a chat link is built." },
  { icon: Share2, title: "Social profiles", body: "Direct profile links for FB, IG, TikTok and LinkedIn." },
  { icon: BarChart3, title: "One set of numbers", body: "Every screen reads the same live counts, in WAT." },
];

function Landing() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard", replace: true });
  }, [loading, user, navigate]);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-5 py-6">
      <header className="flex items-center justify-between">
        <Logo />
        <Button asChild variant="secondary" size="sm">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>

      <section className="flex flex-1 flex-col justify-center py-14">
        <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-brand">
          Verunda outreach engine
        </p>
        <h1 className="mt-4 max-w-2xl font-display text-4xl font-extrabold leading-[1.05] sm:text-6xl">
          Turn a lead file into <span className="text-gradient-brand">one-click outreach</span>.
        </h1>
        <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
          Upload CSV, TXT or Excel. Scoutier detects every channel, skips duplicates and dead
          numbers, and tracks each click live across your team.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/auth">Get started</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link to="/auth">I have an account</Link>
          </Button>
        </div>

        <div className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="panel p-4">
              <Icon className="size-5 text-brand" />
              <h2 className="mt-3 font-display text-sm font-bold">{title}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border pt-5 text-xs text-muted-foreground">
        Verunda Team Scoutier — team access only.
      </footer>
    </main>
  );
}
