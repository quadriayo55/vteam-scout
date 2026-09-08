import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useProfile, useRoles, displayNameOf } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Link2,
  Megaphone,
  BarChart3,
  Trophy,
  Users,
  Settings,
  LogOut,
  Loader2,
  Menu,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/outreach", label: "Outreach Links", icon: Link2 },
  { to: "/campaigns", label: "Campaigns", icon: Megaphone },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { to: "/team", label: "Team", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading } = useAuth();
  const profile = useProfile();
  const roles = useRoles();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  // Complete profile creation for accounts that confirmed by email after signing up.
  useEffect(() => {
    if (!user || profile.isLoading || profile.data) return;
    const raw = window.localStorage.getItem("verunda_pending_profile");
    const pending = raw ? (JSON.parse(raw) as { display_name?: string; team_id?: string }) : {};
    supabase
      .from("profiles")
      .insert({
        id: user.id,
        email: user.email ?? "",
        display_name:
          pending.display_name?.trim() || (user.email ?? "").split("@")[0] || "Scout",
        team_id: pending.team_id ?? null,
      })
      .then(() => {
        window.localStorage.removeItem("verunda_pending_profile");
        queryClient.invalidateQueries({ queryKey: ["profile"] });
        queryClient.invalidateQueries({ queryKey: ["roles"] });
      });
  }, [user, profile.isLoading, profile.data, queryClient]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-brand" />
      </div>
    );
  }

  const name = displayNameOf(profile.data, user.email);
  const roleLabel = roles.isSuperAdmin
    ? "Super Admin"
    : roles.isTeamLeader
      ? "Team Leader"
      : "Member";

  async function signOut() {
    await supabase.auth.signOut();
    queryClient.clear();
    navigate({ to: "/auth", replace: true });
  }

  const accountMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2.5 rounded-xl border border-border bg-surface/60 px-2.5 py-2 text-left transition-colors hover:bg-accent">
          <Avatar className="size-8">
            <AvatarImage src={profile.data?.avatar_url ?? undefined} alt={name} />
            <AvatarFallback className="bg-brand text-xs font-bold text-brand-foreground">
              {(name || "?").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="hidden min-w-0 leading-tight sm:block">
            <span className="block truncate text-sm font-semibold">{name}</span>
            <span className="block text-[11px] text-muted-foreground">{roleLabel}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="leading-tight">
          <span className="block truncate">{name}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground">
            {profile.data?.email ?? user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings className="mr-2 size-4" /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={signOut}>
          <LogOut className="mr-2 size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-sidebar/70 p-5 lg:block">
        <Link to="/dashboard">
          <Logo />
        </Link>
        <nav className="mt-8 space-y-1">
          {NAV.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-3 lg:hidden">
            <Button variant="ghost" size="icon" onClick={() => setOpen((v) => !v)}>
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </Button>
            <Logo compact />
          </div>
          <span className="hidden text-sm font-semibold text-muted-foreground lg:block">
            {roleLabel} workspace
          </span>
          {accountMenu}
        </header>

        {open && (
          <nav className="space-y-1 border-b border-border bg-surface/80 p-3 lg:hidden">
            {NAV.map((item) => (
              <NavItem key={item.to} {...item} onNavigate={() => setOpen(false)} />
            ))}
          </nav>
        )}

        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavItem({
  to,
  label,
  icon: Icon,
  onNavigate,
}: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      activeProps={{
        className: cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold",
          "bg-brand text-brand-foreground shadow-lg shadow-brand/20 hover:bg-brand hover:text-brand-foreground",
        ),
      }}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
}
