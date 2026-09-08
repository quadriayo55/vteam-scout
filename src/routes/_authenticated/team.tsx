import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, usePermissions, type AppRole } from "@/lib/auth";
import { totalsQuery } from "@/lib/stats";
import { compact } from "@/lib/outreach";
import { RoleGate } from "@/components/RoleGate";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Members — Verunda Team Scoutier" },
      { name: "description", content: "Everyone in the workspace, their access level and their live outreach numbers." },
      { property: "og:title", content: "Members — Verunda Team Scoutier" },
      { property: "og:description", content: "Manage access levels and see每 member's outreach numbers." },
    ],
  }),
  component: () => (
    <RoleGate need="seeEveryonesStats">
      <MembersPage />
    </RoleGate>
  ),
});

type Member = {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  is_active: boolean;
};

function MembersPage() {
  const { user } = useAuth();
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const [openMember, setOpenMember] = useState<Member | null>(null);

  const members = useQuery({
    queryKey: ["members"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,email,display_name,avatar_url,is_active")
        .eq("is_active", true)
        .order("display_name");
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });

  const allRoles = useQuery({
    queryKey: ["all-roles"],
    enabled: permissions.manageMembers,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id,role");
      if (error) throw error;
      return (data ?? []) as { user_id: string; role: AppRole }[];
    },
  });

  function levelOf(id: string) {
    const roles = (allRoles.data ?? []).filter((row) => row.user_id === id).map((r) => r.role);
    if (roles.includes("super_admin")) return "Admin";
    if (roles.includes("team_leader")) return "Team Leader";
    return "Member";
  }

  async function setLevel(member: Member, level: "Admin" | "Team Leader" | "Member") {
    const wanted: AppRole[] =
      level === "Admin" ? ["super_admin"] : level === "Team Leader" ? ["team_leader"] : [];

    const { error: clearError } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", member.id)
      .in("role", ["super_admin", "team_leader"]);
    if (clearError) {
      toast.error(clearError.message);
      return;
    }
    if (wanted.length) {
      const { error } = await supabase
        .from("user_roles")
        .insert(wanted.map((role) => ({ user_id: member.id, role })));
      if (error && !/duplicate/i.test(error.message)) {
        toast.error(error.message);
        return;
      }
    }
    await queryClient.invalidateQueries();
    toast.success(`${member.display_name || member.email} is now ${level}.`);
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
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Members</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {permissions.manageMembers
            ? "Everyone in the workspace. Set who is an Admin, a Team Leader or a Member."
            : "Everyone in the workspace and their live outreach numbers."}
        </p>
      </div>

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
              {permissions.manageMembers && (
                <Badge variant="secondary">{levelOf(member.id)}</Badge>
              )}
              <Button variant="secondary" size="sm" onClick={() => setOpenMember(member)}>
                View <ChevronRight className="ml-1 size-4" />
              </Button>
            </div>

            {permissions.manageMembers && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                <Button variant="ghost" size="sm" onClick={() => setLevel(member, "Admin")}>
                  Make admin
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setLevel(member, "Team Leader")}>
                  Make team leader
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setLevel(member, "Member")}>
                  Make member
                </Button>
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
        <p className="py-10 text-center text-sm text-muted-foreground">No members yet.</p>
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
            <p className="font-display text-xl font-bold">{compact(totals.data?.generated ?? 0)}</p>
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
