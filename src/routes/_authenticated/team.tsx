import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useProfile, useRoles } from "@/lib/auth";
import { teamsQuery, totalsQuery } from "@/lib/stats";
import { compact } from "@/lib/outreach";
import { StatCard } from "@/components/StatCard";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, Link2, MousePointerClick, Target, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Team — Verunda Team Scoutier" },
      { name: "description", content: "Team roster, member analytics and team administration." },
      { property: "og:title", content: "Team — Verunda Team Scoutier" },
      { property: "og:description", content: "Team roster, member analytics and team administration." },
    ],
  }),
  component: TeamPage,
});

type Member = {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  team_id: string | null;
  is_active: boolean;
};

function TeamPage() {
  const { user } = useAuth();
  const profile = useProfile();
  const roles = useRoles();
  const queryClient = useQueryClient();
  const teams = useQuery(teamsQuery());

  const [teamId, setTeamId] = useState<string | null>(null);
  const [openMember, setOpenMember] = useState<Member | null>(null);
  const [newTeam, setNewTeam] = useState("");

  const activeTeamId = roles.isSuperAdmin ? (teamId ?? null) : (profile.data?.team_id ?? null);
  const canDrillIn = roles.isSuperAdmin || roles.isTeamLeader;

  const members = useQuery({
    queryKey: ["members", activeTeamId, roles.isSuperAdmin],
    enabled: !!user && !roles.loading,
    queryFn: async () => {
      let query = supabase
        .from("profiles")
        .select("id,email,display_name,avatar_url,team_id,is_active")
        .eq("is_active", true)
        .order("display_name");
      if (activeTeamId) query = query.eq("team_id", activeTeamId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });

  const teamTotals = useQuery({
    ...totalsQuery({ teamId: activeTeamId }, "all"),
    enabled: !!activeTeamId && canDrillIn,
  });

  async function createTeam() {
    if (!newTeam.trim()) return;
    const { error } = await supabase.from("teams").insert({ name: newTeam.trim() });
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewTeam("");
    await queryClient.invalidateQueries({ queryKey: ["teams"] });
    toast.success("Team created.");
  }

  async function makeLeader(member: Member) {
    if (!member.team_id) {
      toast.error("Assign the member to a team first.");
      return;
    }
    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: member.id, role: "team_leader" });
    if (error && !/duplicate/i.test(error.message)) {
      toast.error(error.message);
      return;
    }
    await supabase.from("teams").update({ leader_id: member.id }).eq("id", member.team_id);
    await queryClient.invalidateQueries();
    toast.success(`${member.display_name || member.email} is now a Team Leader.`);
  }

  async function makeSuperAdmin(member: Member) {
    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: member.id, role: "super_admin" });
    if (error && !/duplicate/i.test(error.message)) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries();
    toast.success("Super Admin added.");
  }

  async function moveMember(member: Member, nextTeamId: string) {
    const { error } = await supabase
      .from("profiles")
      .update({ team_id: nextTeamId })
      .eq("id", member.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries();
    toast.success("Member moved.");
  }

  async function wipeData(member: Member, days: number) {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { error } = await supabase
      .from("outreach_links")
      .delete()
      .eq("user_id", member.id)
      .gte("created_at", since);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries();
    toast.success(`Cleared the last ${days} days for this member.`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Team</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {roles.isSuperAdmin
            ? "Switch between teams, manage roles and member data."
            : roles.isTeamLeader
              ? "Your team's roster and live activity."
              : "Your team roster."}
        </p>
      </div>

      {roles.isSuperAdmin && (
        <section className="panel space-y-4 p-4 sm:p-6">
          <div className="space-y-2">
            <Label>Viewing team</Label>
            <Select
              value={teamId ?? "all"}
              onValueChange={(value) => setTeamId(value === "all" ? null : value)}
            >
              <SelectTrigger className="sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All teams</SelectItem>
                {(teams.data ?? []).map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 space-y-2 sm:max-w-xs">
              <Label htmlFor="newTeam">Create a team</Label>
              <Input
                id="newTeam"
                value={newTeam}
                placeholder="e.g. Team Delta"
                onChange={(event) => setNewTeam(event.target.value)}
              />
            </div>
            <Button onClick={createTeam}>
              <Plus className="mr-2 size-4" /> Create
            </Button>
          </div>
        </section>
      )}

      {activeTeamId && canDrillIn && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Team generated"
            value={teamTotals.data?.generated ?? 0}
            icon={<Link2 className="size-4" />}
            loading={teamTotals.isLoading}
          />
          <StatCard
            label="Team clicked"
            value={teamTotals.data?.clicked ?? 0}
            tone="brand"
            icon={<MousePointerClick className="size-4" />}
            loading={teamTotals.isLoading}
          />
          <StatCard
            label="Team scouted"
            value={teamTotals.data?.percent ?? 0}
            suffix="%"
            icon={<Target className="size-4" />}
            loading={teamTotals.isLoading}
          />
        </div>
      )}

      <ul className="space-y-2">
        {(members.data ?? []).map((member) => (
          <li key={member.id} className="panel p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <Avatar className="size-10 shrink-0">
                <AvatarImage src={member.avatar_url ?? undefined} alt={member.display_name} />
                <AvatarFallback className="bg-surface-2 text-xs font-bold">
                  {(member.display_name || member.email).slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {member.display_name || member.email.split("@")[0]}
                  {member.id === user?.id && <span className="ml-2 text-xs text-brand">you</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{member.email}</p>
              </div>
              {canDrillIn && (
                <Button variant="secondary" size="sm" onClick={() => setOpenMember(member)}>
                  View <ChevronRight className="ml-1 size-4" />
                </Button>
              )}
            </div>

            {roles.isSuperAdmin && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                <Button variant="ghost" size="sm" onClick={() => makeLeader(member)}>
                  Make leader
                </Button>
                <Button variant="ghost" size="sm" onClick={() => makeSuperAdmin(member)}>
                  Make super admin
                </Button>
                <Select onValueChange={(value) => moveMember(member, value)}>
                  <SelectTrigger className="h-8 w-36 text-xs">
                    <SelectValue placeholder="Move to team" />
                  </SelectTrigger>
                  <SelectContent>
                    {(teams.data ?? []).map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="sm" onClick={() => wipeData(member, 7)}>
                  Wipe 7 days
                </Button>
                <Button variant="ghost" size="sm" onClick={() => wipeData(member, 30)}>
                  Wipe 30 days
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {members.data?.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">No members in this view.</p>
      )}

      <MemberDialog member={openMember} onClose={() => setOpenMember(null)} />
    </div>
  );
}

function MemberDialog({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const totals = useQuery({
    ...totalsQuery({ userId: member?.id }, "all"),
    enabled: !!member,
  });

  return (
    <Dialog open={!!member} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="size-10">
              <AvatarImage src={member?.avatar_url ?? undefined} alt={member?.display_name ?? ""} />
              <AvatarFallback className="bg-surface-2 text-xs font-bold">
                {(member?.display_name || member?.email || "?").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {member?.display_name || member?.email}
          </DialogTitle>
          <DialogDescription>{member?.email}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl border border-border p-3">
            <p className="text-[11px] uppercase text-muted-foreground">Generated</p>
            <p className="font-display text-xl font-bold">
              {compact(totals.data?.generated ?? 0)}
            </p>
          </div>
          <div className="rounded-xl border border-border p-3">
            <p className="text-[11px] uppercase text-muted-foreground">Clicked</p>
            <p className="font-display text-xl font-bold text-brand">
              {compact(totals.data?.clicked ?? 0)}
            </p>
          </div>
          <div className="rounded-xl border border-border p-3">
            <p className="text-[11px] uppercase text-muted-foreground">Scouted</p>
            <p className="font-display text-xl font-bold text-success">
              {totals.data?.percent ?? 0}%
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="w-fit">
          Same source of truth as the dashboard
        </Badge>
      </DialogContent>
    </Dialog>
  );
}
