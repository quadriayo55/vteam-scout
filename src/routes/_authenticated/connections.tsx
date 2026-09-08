import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useProfile } from "@/lib/auth";
import { getResendStatus, sendTestEmail } from "@/lib/email-connection.functions";
import {
  DEFAULT_EMAIL_SETTINGS,
  senderAddress,
  toLocalPart,
  useEmailSettings,
  type EmailSettings,
} from "@/lib/email-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, Loader2, Mail, RefreshCw, Send, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/connections")({
  head: () => ({
    meta: [
      { title: "Email Connection — Verunda Team Scoutier" },
      {
        name: "description",
        content:
          "Connect your Resend email account, see your verified sending domains and choose the name that sits in front of your domain.",
      },
      { property: "og:title", content: "Email Connection — Verunda Team Scoutier" },
      {
        property: "og:description",
        content: "Link Resend, pick your sender name and reply address, then send a test email.",
      },
    ],
  }),
  component: ConnectionsPage,
});

function ConnectionsPage() {
  const { user } = useAuth();
  const profile = useProfile();
  const queryClient = useQueryClient();
  const fetchStatus = useServerFn(getResendStatus);
  const runTest = useServerFn(sendTestEmail);
  const saved = useEmailSettings();

  const [form, setForm] = useState<EmailSettings>(DEFAULT_EMAIL_SETTINGS);
  const [testTo, setTestTo] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (saved.data && !touched) setForm(saved.data);
  }, [saved.data, touched]);

  useEffect(() => {
    if (!touched && !saved.data && profile.data?.full_name) {
      setForm((current) => ({ ...current, from_local: toLocalPart(profile.data!.full_name ?? "") }));
    }
  }, [profile.data, saved.data, touched]);

  const status = useQuery({
    queryKey: ["resend-status"],
    queryFn: () => fetchStatus({}),
    staleTime: 60000,
  });

  const domains = status.data?.domains ?? [];
  const verified = domains.filter((item) => item.status === "verified");
  const domainOptions = (verified.length ? verified : domains).map((item) => item.name);
  const options = domainOptions.length ? domainOptions : [form.from_domain];

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Please sign in again.");
      const local = toLocalPart(form.from_local);
      if (!local) throw new Error("Add the name that goes in front of the @.");
      const row = {
        user_id: user.id,
        from_local: local,
        from_domain: form.from_domain.trim().toLowerCase(),
        from_name: form.from_name.trim() || "Verunda Team Scoutier",
        reply_to: form.reply_to?.trim() || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("email_settings").upsert(row, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      setTouched(false);
      queryClient.invalidateQueries({ queryKey: ["email-settings"] });
      toast.success("Sender saved. Bulk Outreach will use it from now on.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "That could not be saved."),
  });

  const test = useMutation({
    mutationFn: () =>
      runTest({
        data: {
          to: testTo,
          fromName: form.from_name,
          fromEmail: senderAddress(form),
          replyTo: form.reply_to ?? undefined,
        },
      }),
    onSuccess: () => toast.success(`Test email sent to ${testTo}.`),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "The test email failed."),
  });

  const connected = status.data?.connected ?? false;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand">Connections</p>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Email sending account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Check your Resend account, then choose the name that appears in front of your domain.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="panel space-y-4 p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold">Resend</h2>
              <p className="text-sm text-muted-foreground">
                {status.isPending ? "Checking…" : status.data?.message}
              </p>
            </div>
            <Badge variant={connected ? "secondary" : "outline"} className="shrink-0">
              {connected ? (
                <CheckCircle2 className="mr-1 size-3.5 text-emerald-400" />
              ) : (
                <XCircle className="mr-1 size-3.5 text-destructive" />
              )}
              {connected ? "Connected" : "Not connected"}
            </Badge>
          </div>

          <ul className="space-y-2">
            {domains.length === 0 && !status.isPending && (
              <li className="text-sm text-muted-foreground">
                No sending domain found. Add and verify your domain in Resend, then refresh.
              </li>
            )}
            {domains.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span className="truncate">{item.name}</span>
                <span
                  className={
                    item.status === "verified"
                      ? "shrink-0 text-xs text-emerald-400"
                      : "shrink-0 text-xs text-muted-foreground"
                  }
                >
                  {item.status}
                </span>
              </li>
            ))}
          </ul>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void status.refetch()}
            disabled={status.isFetching}
          >
            {status.isFetching ? (
              <Loader2 className="mr-2 size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 size-3.5" />
            )}
            Refresh
          </Button>
        </section>

        <section className="panel space-y-4 p-4 sm:p-6">
          <h2 className="font-display text-lg font-bold">Your sender</h2>

          <div className="space-y-2">
            <Label htmlFor="from-name">Name recipients see</Label>
            <Input
              id="from-name"
              value={form.from_name}
              onChange={(event) => {
                setTouched(true);
                setForm({ ...form, from_name: event.target.value });
              }}
              placeholder="Quadri from Verunda"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
            <div className="space-y-2">
              <Label htmlFor="from-local">Name before the @</Label>
              <Input
                id="from-local"
                value={form.from_local}
                onChange={(event) => {
                  setTouched(true);
                  setForm({ ...form, from_local: event.target.value });
                }}
                placeholder="quadri"
              />
            </div>
            <div className="space-y-2">
              <Label>Domain</Label>
              <Select
                value={form.from_domain}
                onValueChange={(value) => {
                  setTouched(true);
                  setForm({ ...form, from_domain: value });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick a domain" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
            <p className="font-semibold">Emails will come from</p>
            <p className="mt-1 text-muted-foreground">
              {form.from_name} &lt;{senderAddress(form)}&gt;
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reply-to">Replies go to</Label>
            <Input
              id="reply-to"
              value={form.reply_to ?? ""}
              onChange={(event) => {
                setTouched(true);
                setForm({ ...form, reply_to: event.target.value });
              }}
              placeholder="quadri@verunda.com"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Mail className="mr-2 size-4" />
              )}
              Save sender
            </Button>
          </div>

          <div className="space-y-2 border-t border-border pt-4">
            <Label htmlFor="test-to">Send a test to</Label>
            <div className="flex gap-2">
              <Input
                id="test-to"
                value={testTo}
                onChange={(event) => setTestTo(event.target.value)}
                placeholder="you@example.com"
              />
              <Button
                variant="outline"
                onClick={() => test.mutate()}
                disabled={test.isPending || !testTo.trim()}
              >
                {test.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Send className="mr-2 size-4" />
                )}
                Test
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The domain must be verified in Resend before it can email other people.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
