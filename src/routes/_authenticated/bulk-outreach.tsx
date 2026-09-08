import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useProfile } from "@/lib/auth";
import { sendBulkBatch } from "@/lib/bulk.functions";
import { isValidEmail, spamCheck, compact } from "@/lib/outreach";
import { parseFile } from "@/lib/parse";
import { useTimeZone, formatIn } from "@/lib/tz";
import { useEmailSettings, senderAddress, DEFAULT_EMAIL_SETTINGS } from "@/lib/email-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { StatCard } from "@/components/StatCard";
import { Loader2, Mail, Play, Pause, Send, Upload, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/bulk-outreach")({
  head: () => ({
    meta: [
      { title: "Bulk Outreach — Verunda Team Scoutier" },
      {
        name: "description",
        content:
          "Send personalised outreach emails to thousands of leads at a pace you control, with live delivery progress.",
      },
      { property: "og:title", content: "Bulk Outreach — Verunda Team Scoutier" },
      {
        property: "og:description",
        content: "Real email sending with per-campaign pacing and live delivery progress.",
      },
    ],
  }),
  component: BulkOutreachPage,
});

type Recipient = { email: string; contact_name: string | null; domain: string | null };

const SUBJECT_MAX = 200;
const BODY_MAX = 2000;

function BulkOutreachPage() {
  const { user } = useAuth();
  const profile = useProfile();
  const tz = useTimeZone();
  const queryClient = useQueryClient();
  const runBatch = useServerFn(sendBulkBatch);
  const emailSettings = useEmailSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const stopRef = useRef(false);

  const [raw, setRaw] = useState("");
  const [fileRecipients, setFileRecipients] = useState<Recipient[]>([]);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [batchSize, setBatchSize] = useState(20);
  const [gapSeconds, setGapSeconds] = useState(60);
  const [dailyCap, setDailyCap] = useState(500);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [parsing, setParsing] = useState(false);

  const stats = useMemo(() => {
    const typed = raw
      .split(/[\s,;]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    const map = new Map<string, Recipient>();
    let invalid = 0;
    let duplicates = 0;
    const push = (item: Recipient) => {
      const key = item.email.toLowerCase();
      if (!isValidEmail(key)) {
        invalid += 1;
        return;
      }
      if (map.has(key)) {
        duplicates += 1;
        return;
      }
      map.set(key, { ...item, email: key });
    };
    typed.forEach((email) => push({ email, contact_name: null, domain: null }));
    fileRecipients.forEach(push);
    return {
      recipients: [...map.values()],
      invalid,
      duplicates,
      total: typed.length + fileRecipients.length,
    };
  }, [raw, fileRecipients]);

  const sender = emailSettings.data ?? DEFAULT_EMAIL_SETTINGS;

  const subjectSpam = spamCheck(subject);
  const bodySpam = spamCheck(body);

  const sends = useQuery({
    queryKey: ["bulk-sends", user?.id ?? null],
    enabled: Boolean(user?.id),
    refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bulk_sends")
        .select(
          "id,name,subject,from_name,from_email,total,sent,failed,status,batch_size,gap_seconds,daily_cap,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const recipients = useQuery({
    queryKey: ["bulk-recipients", activeId],
    enabled: Boolean(activeId),
    refetchInterval: running ? 4000 : 20000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bulk_send_recipients")
        .select("id,email,contact_name,status,error,sent_at")
        .eq("send_id", activeId ?? "")
        .order("created_at", { ascending: true })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  async function handleFile(file: File) {
    setParsing(true);
    try {
      const parsed = await parseFile(file);
      const emailIndex = parsed.columns.email;
      if (emailIndex === undefined) {
        toast.error("No email column found in that file.");
        return;
      }
      const nameIndex = parsed.columns.name;
      const domainIndex = parsed.columns.domain;
      const rows: Recipient[] = parsed.rows.map((row) => ({
        email: (row[emailIndex] ?? "").trim(),
        contact_name: nameIndex !== undefined ? (row[nameIndex] ?? "").trim() || null : null,
        domain: domainIndex !== undefined ? (row[domainIndex] ?? "").trim() || null : null,
      }));
      setFileRecipients((current) => [...current, ...rows]);
      toast.success(`${rows.length.toLocaleString()} rows read from ${file.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That file could not be read.");
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const create = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Please sign in again.");
      if (!stats.recipients.length) throw new Error("Add at least one valid recipient.");
      if (!subject.trim()) throw new Error("Add a subject line.");
      if (!body.trim()) throw new Error("Add a message body.");

      const { data: send, error } = await supabase
        .from("bulk_sends")
        .insert({
          user_id: user.id,
          team_id: profile.data?.team_id ?? null,
          name: name.trim() || `Send ${new Date().toISOString().slice(0, 10)}`,
          from_name: sender.from_name,
          from_email: senderAddress(sender),
          reply_to: sender.reply_to,
          subject: subject.slice(0, SUBJECT_MAX),
          body: body.slice(0, BODY_MAX),
          total: stats.recipients.length,
          batch_size: Math.max(1, Math.min(batchSize, 100)),
          gap_seconds: Math.max(0, Math.min(gapSeconds, 3600)),
          daily_cap: Math.max(1, Math.min(dailyCap, 1000000)),
          status: "ready",
        })
        .select("id")
        .single();
      if (error) throw error;

      const chunkSize = 500;
      for (let i = 0; i < stats.recipients.length; i += chunkSize) {
        const chunk = stats.recipients.slice(i, i + chunkSize).map((item) => ({
          send_id: send.id,
          user_id: user.id,
          email: item.email,
          contact_name: item.contact_name,
          domain: item.domain,
        }));
        const { error: chunkError } = await supabase
          .from("bulk_send_recipients")
          .upsert(chunk, { onConflict: "send_id,email", ignoreDuplicates: true });
        if (chunkError) throw chunkError;
      }
      return send.id as string;
    },
    onSuccess: (id) => {
      setActiveId(id);
      queryClient.invalidateQueries({ queryKey: ["bulk-sends"] });
      toast.success("Send prepared. Press Start sending when you're ready.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "That send could not be prepared."),
  });

  async function start(sendId: string, gap: number) {
    setActiveId(sendId);
    setRunning(true);
    stopRef.current = false;
    try {
      for (;;) {
        if (stopRef.current) break;
        const result = await runBatch({ data: { sendId } });
        queryClient.invalidateQueries({ queryKey: ["bulk-sends"] });
        queryClient.invalidateQueries({ queryKey: ["bulk-recipients", sendId] });
        const firstError = result.errors[0];
        if (firstError) toast.error(firstError);
        if (result.capReached) {
          toast.warning("Daily limit reached — sending paused until tomorrow.");
          break;
        }
        if (result.remaining === 0) {
          toast.success("All emails sent.");
          break;
        }
        if (gap > 0) await new Promise((resolve) => setTimeout(resolve, gap * 1000));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sending stopped unexpectedly.");
    } finally {
      setRunning(false);
    }
  }

  const active = (sends.data ?? []).find((row) => row.id === activeId);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand">Bulk Outreach</p>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Send real emails at your pace</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste or upload your leads, write once, and every email goes out personalised with{" "}
          <code className="rounded bg-muted px-1">{"{name}"}</code>.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section className="panel space-y-4 p-4 sm:p-6">
          <div className="space-y-2">
            <Label htmlFor="recipients">Recipient emails</Label>
            <Textarea
              id="recipients"
              rows={5}
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              placeholder="paste emails separated by commas, spaces or new lines"
            />
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary">{compact(stats.recipients.length)} valid</Badge>
              <Badge variant="outline">{compact(stats.duplicates)} duplicates removed</Badge>
              <Badge variant="outline">{compact(stats.invalid)} invalid</Badge>
              <Badge variant="outline">{compact(stats.total)} read in total</Badge>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt,.xls,.xlsx"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={parsing}
              >
                {parsing ? (
                  <Loader2 className="mr-2 size-3.5 animate-spin" />
                ) : (
                  <Upload className="mr-2 size-3.5" />
                )}
                Upload lead file
              </Button>
              {fileRecipients.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setFileRecipients([])}
                >
                  Clear file rows
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="send-name">Send name</Label>
              <Input
                id="send-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="September Shopify push"
              />
            </div>
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <p className="font-semibold">Resend delivery</p>
              <p className="mt-1 text-muted-foreground">
                From: {sender.from_name} &lt;{senderAddress(sender)}&gt;
              </p>
              <p className="text-muted-foreground">
                Replies: {sender.reply_to ?? senderAddress(sender)}
              </p>
              <Link
                to="/connections"
                className="mt-1 inline-block text-xs font-semibold text-brand underline"
              >
                Change sender
              </Link>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="subject">Subject line</Label>
              <span className="text-xs text-muted-foreground">
                {subject.length}/{SUBJECT_MAX}
              </span>
            </div>
            <Input
              id="subject"
              maxLength={SUBJECT_MAX}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Quick idea for {name}"
            />
            <SpamHint level={subjectSpam.level} hits={subjectSpam.hits} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="body">Message body</Label>
              <span className="text-xs text-muted-foreground">
                {body.length}/{BODY_MAX}
              </span>
            </div>
            <Textarea
              id="body"
              rows={8}
              maxLength={BODY_MAX}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={"Hi {name},\n\nI noticed your store and had one idea..."}
            />
            <SpamHint level={bodySpam.level} hits={bodySpam.hits} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="batch">Emails per batch</Label>
              <Input
                id="batch"
                type="number"
                min={1}
                max={100}
                value={batchSize}
                onChange={(event) => setBatchSize(Number(event.target.value) || 1)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gap">Gap between batches (seconds)</Label>
              <Input
                id="gap"
                type="number"
                min={0}
                max={3600}
                value={gapSeconds}
                onChange={(event) => setGapSeconds(Number(event.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cap">Daily limit</Label>
              <Input
                id="cap"
                type="number"
                min={1}
                value={dailyCap}
                onChange={(event) => setDailyCap(Number(event.target.value) || 1)}
              />
            </div>
          </div>

          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || !stats.recipients.length}
            className="w-full sm:w-auto"
          >
            {create.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Mail className="mr-2 size-4" />
            )}
            Prepare send for {compact(stats.recipients.length)} recipients
          </Button>
        </section>

        <section className="space-y-4">
          {active && (
            <div className="panel space-y-4 p-4 sm:p-6">
              <div>
                <h2 className="font-display text-lg font-bold">{active.name}</h2>
                <p className="text-xs text-muted-foreground">
                  {active.from_name} · {active.from_email} · {active.status}
                </p>
              </div>
              <Progress value={active.total ? (active.sent / active.total) * 100 : 0} />
              <div className="grid grid-cols-3 gap-2">
                <StatCard label="Sent" value={active.sent} />
                <StatCard label="Left" value={Math.max(active.total - active.sent - active.failed, 0)} />
                <StatCard label="Failed" value={active.failed} tone="muted" />
              </div>
              <div className="flex gap-2">
                {running ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      stopRef.current = true;
                      setRunning(false);
                    }}
                  >
                    <Pause className="mr-2 size-4" /> Pause
                  </Button>
                ) : (
                  <Button onClick={() => void start(active.id, active.gap_seconds)}>
                    <Play className="mr-2 size-4" /> Start sending
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {active.batch_size} at a time, {active.gap_seconds}s apart, up to {active.daily_cap}{" "}
                a day. Keep this page open while it runs.
              </p>
              <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                {(recipients.data ?? []).map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs"
                  >
                    <span className="truncate">{row.email}</span>
                    <span
                      className={
                        row.status === "sent"
                          ? "shrink-0 text-emerald-400"
                          : row.status === "failed"
                            ? "shrink-0 text-destructive"
                            : "shrink-0 text-muted-foreground"
                      }
                    >
                      {row.status === "sent" && row.sent_at
                        ? formatIn(tz, row.sent_at)
                        : row.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="panel p-4 sm:p-6">
            <h2 className="font-display text-lg font-bold">Your sends</h2>
            <ul className="mt-3 space-y-2">
              {(sends.data ?? []).length === 0 && (
                <li className="text-sm text-muted-foreground">No sends yet.</li>
              )}
              {(sends.data ?? []).map((row) => (
                <li key={row.id}>
                  <button
                    onClick={() => setActiveId(row.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-surface/50 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{row.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {row.sent}/{row.total} sent · {row.status}
                      </span>
                    </span>
                    <Send className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

function SpamHint({ level, hits }: { level: "clean" | "caution" | "risky"; hits: string[] }) {
  if (level === "clean") {
    return <p className="text-xs text-emerald-400">Looks clean — low spam risk.</p>;
  }
  return (
    <p
      className={`flex items-start gap-1.5 text-xs ${level === "risky" ? "text-destructive" : "text-amber-400"}`}
    >
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      {level === "risky" ? "High spam risk" : "Could look spammy"}
      {hits.length > 0 && `: ${hits.join(", ")}`}
    </p>
  );
}
