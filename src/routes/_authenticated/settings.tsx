import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useProfile } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TIME_ZONES, browserTimeZone } from "@/lib/tz";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Verunda Team Scoutier" },
      { name: "description", content: "Update your display name, photo, password and account status." },
      { property: "og:title", content: "Settings — Verunda Team Scoutier" },
      { property: "og:description", content: "Update your display name, photo, password and account status." },
    ],
  }),
  component: SettingsPage,
});

const TEN_YEARS = 60 * 60 * 24 * 365 * 10;

function SettingsPage() {
  const { user } = useAuth();
  const profile = useProfile();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [password, setPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [zone, setZone] = useState(browserTimeZone());

  useEffect(() => {
    if (profile.data) {
      setName(profile.data.display_name);
      if (profile.data.timezone) setZone(profile.data.timezone);
    }
  }, [profile.data]);


  async function saveName() {
    if (!user || !name.trim()) {
      toast.error("Display name can't be empty.");
      return;
    }
    setSavingName(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: name.trim(), timezone: zone })
      .eq("id", user.id);
    setSavingName(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries();
    toast.success("Display name updated.");
  }

  async function uploadAvatar(file: File | undefined) {
    if (!file || !user) return;
    setUploading(true);
    try {
      const path = `${user.id}/avatar-${Date.now()}.${file.name.split(".").pop() ?? "jpg"}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data, error: signError } = await supabase.storage
        .from("avatars")
        .createSignedUrl(path, TEN_YEARS);
      if (signError) throw signError;
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: data.signedUrl })
        .eq("id", user.id);
      if (error) throw error;
      await queryClient.invalidateQueries();
      toast.success("Profile photo updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function changePassword() {
    if (password.length < 6) {
      toast.error("Use at least 6 characters.");
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSavingPassword(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPassword("");
    toast.success("Password changed.");
  }

  async function deactivate() {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ is_active: false }).eq("id", user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.auth.signOut();
    queryClient.clear();
    navigate({ to: "/auth", replace: true });
    toast.success("Account deactivated.");
  }

  const initials = (profile.data?.display_name || user?.email || "?").slice(0, 2).toUpperCase();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Personalise your Scoutier account.</p>
      </div>

      <section className="panel space-y-5 p-4 sm:p-6">
        <h2 className="font-display text-lg font-bold">Personalisation</h2>

        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            <AvatarImage src={profile.data?.avatar_url ?? undefined} alt={name} />
            <AvatarFallback className="bg-brand font-bold text-brand-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => uploadAvatar(event.target.files?.[0])}
            />
            <Button variant="secondary" onClick={() => fileInput.current?.click()} disabled={uploading}>
              {uploading && <Loader2 className="mr-2 size-4 animate-spin" />}
              Change photo
            </Button>
            <p className="mt-1.5 text-xs text-muted-foreground">JPG or PNG, up to 3MB.</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="displayName">Display name</Label>
          <Input id="displayName" value={name} onChange={(event) => setName(event.target.value)} />
        </div>

        <div className="space-y-2">
          <Label>Timezone</Label>
          <Select value={zone} onValueChange={setZone}>
            <SelectTrigger>
              <SelectValue placeholder="Pick your timezone" />
            </SelectTrigger>
            <SelectContent>
              {[...new Set([browserTimeZone(), ...TIME_ZONES])].map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz.replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Your activity times are shown in this timezone.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={profile.data?.email ?? user?.email ?? ""} readOnly disabled />
          </div>
          <div className="space-y-2">
            <Label>Team</Label>
            <Input value={teamName} readOnly disabled />
          </div>
        </div>

        <Button onClick={saveName} disabled={savingName}>
          {savingName && <Loader2 className="mr-2 size-4 animate-spin" />}
          Save changes
        </Button>
      </section>

      <section className="panel space-y-4 p-4 sm:p-6">
        <h2 className="font-display text-lg font-bold">Password</h2>
        <div className="space-y-2">
          <Label htmlFor="newPassword">New password</Label>
          <Input
            id="newPassword"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <Button variant="secondary" onClick={changePassword} disabled={savingPassword}>
          {savingPassword && <Loader2 className="mr-2 size-4 animate-spin" />}
          Change password
        </Button>
      </section>

      <section className="panel space-y-3 p-4 sm:p-6">
        <h2 className="font-display text-lg font-bold">Deactivate account</h2>
        <p className="text-sm text-muted-foreground">
          Your account is hidden from the leaderboard and team lists, and you're signed out.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">Deactivate my account</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Deactivate this account?</AlertDialogTitle>
              <AlertDialogDescription>
                You'll be signed out immediately. A Super Admin can restore access later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={deactivate}>Deactivate</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </div>
  );
}
