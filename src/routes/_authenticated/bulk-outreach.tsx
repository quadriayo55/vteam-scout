import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { sendBulkBatch, sendDraftTest } from "@/lib/bulk.functions";
import { writingAssist, type AssistMode } from "@/lib/ai.functions";
import { isValidEmail, spamCheck, compact, personalize } from "@/lib/outreach";
import { extractContacts, gradeList } from "@/lib/extract";
import { parseFile } from "@/lib/parse";
import {
  useTemplates,
  STARTER_TEMPLATES,
  SUBJECT_CHIPS,
  TONE_CHIPS,
  TEMPLATE_CATEGORIES,
  variantFor,
  type Rotation,
  type TemplateRow,
} from "@/lib/templates";
import { useTimeZone, formatIn } from "@/lib/tz";
import { useEmailSettings, senderAddress, DEFAULT_EMAIL_SETTINGS } from "@/lib/email-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatCard } from "@/components/StatCard";
import {
  Loader2,
  Mail,
  Play,
  Pause,
  Send,
  Upload,
  AlertTriangle,
  Eye,
  Sparkles,
  Wand2,
  ShieldCheck,
  SpellCheck,
  Gauge,
  Trash2,
  Plus,
  RotateCcw,
  Shuffle,
} from "lucide-react";
import { RoleGate } from "@/components/RoleGate";

export const Route = createFileRoute("/_authenticated/bulk-outreach")({
  head: () => ({
    meta: [
      { title: "Bulk Outreach — Verunda Team Scoutier" },
      {
        name: "description",
        content:
          "Send personalised outreach emails to thousands of leads at a pace you control, with rotating messages, writing tools and live delivery progress.",
      },
      { property: "og:title", content: "Bulk Outreach — Verunda Team Scoutier" },
      {
        property: "og:description",
        content: "Rotating messages, writing tools and live delivery progress on every batch.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RoleGate need="sendBulkEmail">
      <BulkOutreachPage />
    </RoleGate>
  ),
});

type Recipient = {
  email: string;
  contact_name: string | null;
  domain: string | null;
  brand: string | null;
};

const BRAND_HINTS = [
  "brand",
  "businessname",
  "business",
  "storename",
  "store",
  "shopname",
  "shop",
  "company",
  "companyname",
  "organisation",
  "organization",
];
type Message = { subject: string; body: string };

const SUBJECT_MAX = 200;
const BODY_MAX = 2000;
const MAX_MESSAGES = 5;

const emptyMessage = (): Message => ({ subject: "", body: "" });

function BulkOutreachPage() {
  const { user } = useAuth();
  const tz = useTimeZone();
  const queryClient = useQueryClient();
  const runBatch = useServerFn(sendBulkBatch);
  const runTest = useServerFn(sendDraftTest);
  const runAssist = useServerFn(writingAssist);
  const emailSettings = useEmailSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const stopRef = useRef(false);

  const [raw, setRaw] = useState("");
  const [fileRecipients, setFileRecipients] = useState<Recipient[]>([]);
  const [name, setName] = useState("");
  const [messages, setMessages] = useState<Message[]>([emptyMessage()]);
  const [activeMessage, setActiveMessage] = useState(0);
  const [rotationOn, setRotationOn] = useState(false);
  const [rotation, setRotation] = useState<Rotation>("alternate");
  const [rotationSize, setRotationSize] = useState(10);
  const [startWith, setStartWith] = useState(0);
  const [batchSize, setBatchSize] = useState(20);
  const [gapSeconds, setGapSeconds] = useState(60);
  const [dailyCap, setDailyCap] = useState(5000);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [assist, setAssist] = useState<{ title: string; text: string } | null>(null);
  const [assisting, setAssisting] = useState<AssistMode | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [newTemplate, setNewTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateCategory, setTemplateCategory] = useState<string>(TEMPLATE_CATEGORIES[0]);
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateBody, setTemplateBody] = useState("");

  const templates = useTemplates(user?.id);
  const sender = emailSettings.data ?? DEFAULT_EMAIL_SETTINGS;
  const count = messages.length;
  const current = messages[activeMessage] ?? messages[0]!;

  const stats = useMemo(() => {
    const pasted = extractContacts(raw);
    const map = new Map<string, Recipient>();
    let invalid = pasted.invalid;
    let duplicates = pasted.duplicates;

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

    pasted.contacts.forEach((item) =>
      push({ email: item.email, contact_name: item.contact_name, domain: null, brand: null }),
    );
    fileRecipients.forEach(push);

    const recipients = [...map.values()];
    const withNames = recipients.filter((item) => item.contact_name).length;
    return {
      recipients,
      invalid,
      duplicates,
      withNames,
      found: pasted.found + fileRecipients.length,
      grade: gradeList({ valid: recipients.length, invalid, duplicates, withNames }),
    };
  }, [raw, fileRecipients]);

  const subjectSpam = spamCheck(current.subject);
  const bodySpam = spamCheck(current.body);

  const sentToday = useQuery({
    queryKey: ["sent-today", user?.id ?? null],
    enabled: Boolean(user?.id),
    refetchInterval: 30000,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("email_sent_daily", { _days: 1 });
      if (error) throw error;
      const rows = (data ?? []) as unknown as { sent: number }[];
      return rows.reduce((sum, row) => sum + Number(row.sent), 0);
    },
  });

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

  function updateMessage(patch: Partial<Message>) {
    setMessages((list) =>
      list.map((item, index) => (index === activeMessage ? { ...item, ...patch } : item)),
    );
  }

  function setMessageCount(next: number) {
    setMessages((list) => {
      if (next === list.length) return list;
      if (next < list.length) return list.slice(0, next);
      return [...list, ...Array.from({ length: next - list.length }, emptyMessage)];
    });
    setActiveMessage((index) => Math.min(index, next - 1));
    setStartWith((index) => Math.min(index, next - 1));
    setRotationOn(next > 1);
  }

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
      const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
      const brandIndex = parsed.headers.findIndex((header, index) => {
        if (index === nameIndex || index === emailIndex || index === domainIndex) return false;
        const h = norm(header);
        return Boolean(h) && BRAND_HINTS.some((hint) => h === hint || h.includes(hint));
      });
      const rows: Recipient[] = parsed.rows.map((row) => ({
        email: (row[emailIndex] ?? "").trim(),
        contact_name: nameIndex !== undefined ? (row[nameIndex] ?? "").trim() || null : null,
        domain: domainIndex !== undefined ? (row[domainIndex] ?? "").trim() || null : null,
        brand: brandIndex >= 0 ? (row[brandIndex] ?? "").trim() || null : null,
      }));
      setFileRecipients((currentRows) => [...currentRows, ...rows]);
      const found = [
        nameIndex !== undefined ? "names" : null,
        brandIndex >= 0 ? "brand / store names" : null,
        domainIndex !== undefined ? "store links" : null,
      ].filter(Boolean);
      toast.success(
        `${rows.length.toLocaleString()} rows read from ${file.name}${
          found.length ? ` — ${found.join(", ")} picked up` : ""
        }`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That file could not be read.");
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function callAssist(mode: AssistMode, title: string, text: string) {
    if (!text.trim()) {
      toast.error("Write something first.");
      return;
    }
    setAssisting(mode);
    try {
      const result = await runAssist({ data: { mode, text } });
      if (mode === "grammar" || mode === "rephrase") {
        setAssist({ title, text: result.result });
      } else {
        setAssist({ title, text: result.result });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That tool could not run.");
    } finally {
      setAssisting(null);
    }
  }

  const create = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Please sign in again.");
      if (!stats.recipients.length) throw new Error("Add at least one valid recipient.");
      const used = rotationOn ? messages : [current];
      const filled = used.filter((item) => item.subject.trim() && item.body.trim());
      if (filled.length !== used.length) {
        throw new Error("Every message needs a subject and a body before sending.");
      }

      const total = stats.recipients.length;
      const { data: send, error } = await supabase
        .from("bulk_sends")
        .insert({
          user_id: user.id,
          name: name.trim() || `Send ${new Date().toISOString().slice(0, 10)}`,
          from_name: sender.from_name,
          from_email: senderAddress(sender),
          reply_to: sender.reply_to,
          subject: filled[0]!.subject.slice(0, SUBJECT_MAX),
          body: filled[0]!.body.slice(0, BODY_MAX),
          variants: filled.map((item) => ({
            subject: item.subject.slice(0, SUBJECT_MAX),
            body: item.body.slice(0, BODY_MAX),
          })),
          rotation: rotationOn ? rotation : "alternate",
          rotation_size: Math.max(1, Math.min(rotationSize, 1000)),
          total,
          batch_size: Math.max(1, Math.min(batchSize, 100)),
          gap_seconds: Math.max(0, Math.min(gapSeconds, 3600)),
          daily_cap: Math.max(1, Math.min(dailyCap, 5000)),
          status: "ready",
        })
        .select("id")
        .single();
      if (error) throw error;

      const chunkSize = 500;
      for (let i = 0; i < total; i += chunkSize) {
        const chunk = stats.recipients.slice(i, i + chunkSize).map((item, offset) => {
          const index = i + offset;
          const picked = rotationOn
            ? (variantFor(index, filled.length, rotation, rotationSize, total) + startWith) %
              filled.length
            : 0;
          return {
            send_id: send.id,
            user_id: user.id,
            email: item.email,
            contact_name: item.contact_name,
            domain: item.domain,
            brand: item.brand,
            variant: picked,
          };
        });
        const { error: chunkError } = await supabase
          .from("bulk_send_recipients")
          .insert(chunk);
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

  const test = useMutation({
    mutationFn: async () => {
      const to = testTo.trim() || user?.email || "";
      return runTest({
        data: {
          to,
          fromName: sender.from_name,
          fromEmail: senderAddress(sender),
          replyTo: sender.reply_to ?? undefined,
          subject: current.subject,
          body: current.body,
          name: stats.recipients[0]?.contact_name ?? "there",
          brand: stats.recipients[0]?.brand ?? undefined,
          domain: stats.recipients[0]?.domain ?? undefined,
        },
      });
    },
    onSuccess: () => toast.success("Test email sent — check that inbox."),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "That test could not be sent."),
  });

  const removeSend = useMutation({
    mutationFn: async (id: string) => {
      const { error: rowsError } = await supabase
        .from("bulk_send_recipients")
        .delete()
        .eq("send_id", id);
      if (rowsError) throw rowsError;
      const { error } = await supabase.from("bulk_sends").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      if (activeId === id) setActiveId(null);
      queryClient.invalidateQueries({ queryKey: ["bulk-sends"] });
      toast.success("Send deleted.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "That send could not be deleted."),
  });


  const saveTemplate = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Please sign in again.");
      if (!templateName.trim()) throw new Error("Give the template a name.");
      if (!templateSubject.trim()) throw new Error("Add a subject line for the template.");
      if (!templateBody.trim()) throw new Error("Add a message for the template.");
      const { error } = await supabase.from("email_templates").insert({
        user_id: user.id,
        name: templateName.trim(),
        category: templateCategory,
        subject: templateSubject.trim(),
        body: templateBody.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewTemplate(false);
      setTemplateName("");
      setTemplateSubject("");
      setTemplateBody("");
      void templates.refetch();
      toast.success("Template saved.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "That template could not be saved."),
  });

  const removeTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void templates.refetch(),
  });

  const resetTemplates = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Please sign in again.");
      await supabase.from("email_templates").delete().eq("user_id", user.id);
      const { error } = await supabase
        .from("email_templates")
        .insert(STARTER_TEMPLATES.map((item) => ({ ...item, user_id: user.id })));
      if (error) throw error;
    },
    onSuccess: () => {
      void templates.refetch();
      toast.success("Templates reset to the starter set.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Templates could not be reset."),
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
        queryClient.invalidateQueries({ queryKey: ["sent-today"] });
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
  const shownTemplates: TemplateRow[] =
    templates.data && templates.data.length > 0
      ? templates.data
      : STARTER_TEMPLATES.map((item, index) => ({ ...item, id: `starter-${index}` }));
  const previewName = stats.recipients[0]?.contact_name ?? "there";
  const totalGenerated = (sends.data ?? []).reduce((sum, row) => sum + row.total, 0);
  const totalSent = (sends.data ?? []).reduce((sum, row) => sum + row.sent, 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand">Bulk Outreach</p>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Fast mail send</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste anything with emails in it, write up to ten rotating messages, and every email goes
          out personalised with <code className="rounded bg-muted px-1">{"{name}"}</code>.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          {/* Recipients */}
          <section className="panel space-y-3 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="recipients">Recipient emails</Label>
              <Badge variant="secondary" className="gap-1">
                <Sparkles className="size-3" /> Smart extraction
              </Badge>
            </div>
            <Textarea
              id="recipients"
              rows={5}
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              placeholder={'Paste anything — one per line, comma soup, or "Jane Doe <jane@shop.com>"'}
            />
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary">{compact(stats.recipients.length)} valid</Badge>
              <Badge variant="outline">{compact(stats.duplicates)} duplicates removed</Badge>
              <Badge variant="outline">{compact(stats.invalid)} unusable</Badge>
              <Badge variant="outline">{compact(stats.withNames)} with names</Badge>
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
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRaw("");
                  setFileRecipients([]);
                }}
              >
                <Trash2 className="mr-2 size-3.5" /> Clear
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface/50 p-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand/15 font-display text-lg font-bold text-brand">
                {stats.grade.grade}
              </span>
              <span className="min-w-0 text-xs">
                <span className="block font-semibold">List quality {stats.grade.score}/100</span>
                <span className="block text-muted-foreground">{stats.grade.note}</span>
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                Daily limit: {compact(sentToday.data ?? 0)} / {compact(dailyCap)}
              </span>
            </div>
          </section>

          {/* Message rotation */}
          <section className="panel space-y-4 p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-display text-lg font-bold">
                  <Shuffle className="size-4 text-brand" /> Multi-message rotation
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Rotate up to ten messages so consecutive emails don't carry the same subject and
                  body — this helps avoid repetitive-content flags at Gmail and Outlook.
                </p>
              </div>
              <Switch
                checked={rotationOn}
                onCheckedChange={(value) => {
                  setRotationOn(value);
                  if (value && messages.length === 1) setMessageCount(2);
                }}
                aria-label="Use more than one message"
              />
            </div>

            {rotationOn && (
              <div className="space-y-3 rounded-xl border border-border bg-surface/40 p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Messages:</span>
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setMessageCount(option)}
                      className={
                        count === option
                          ? "size-7 rounded-full bg-brand text-xs font-bold text-brand-foreground"
                          : "size-7 rounded-full border border-border text-xs font-semibold text-muted-foreground hover:text-foreground"
                      }
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Start with:</span>
                  {messages.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setStartWith(index)}
                      className={
                        startWith === index
                          ? "rounded-full bg-brand px-3 py-1 text-xs font-bold text-brand-foreground"
                          : "rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
                      }
                    >
                      Message {index + 1}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Pattern:</span>
                  {(
                    [
                      ["alternate", "Alternate"],
                      ["blocks", `Blocks of ${rotationSize}`],
                      ["split", "Split evenly"],
                    ] as [Rotation, string][]
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRotation(value)}
                      className={
                        rotation === value
                          ? "rounded-full bg-brand px-3 py-1 text-xs font-bold text-brand-foreground"
                          : "rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
                      }
                    >
                      {label}
                    </button>
                  ))}
                  {rotation === "blocks" && (
                    <Input
                      type="number"
                      min={1}
                      max={1000}
                      value={rotationSize}
                      onChange={(event) => setRotationSize(Number(event.target.value) || 1)}
                      className="h-7 w-20 text-xs"
                      aria-label="Block size"
                    />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {rotation === "alternate"
                    ? `Every recipient in turn gets the next of your ${count} messages.`
                    : rotation === "blocks"
                      ? `Each message goes to ${rotationSize} recipients in a row before switching.`
                      : `Your list is split into ${count} equal groups, one message each.`}
                </p>
              </div>
            )}

            {/* Message tabs */}
            {count > 1 && (
              <div className="flex flex-wrap gap-2">
                {messages.map((item, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setActiveMessage(index)}
                    className={
                      activeMessage === index
                        ? "rounded-full bg-brand px-3 py-1.5 text-xs font-bold text-brand-foreground"
                        : "rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                    }
                  >
                    Message {index + 1}
                    {!item.subject.trim() || !item.body.trim() ? " · empty" : ""}
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="subject">Subject line {count > 1 ? activeMessage + 1 : ""}</Label>
                <span className="text-xs text-muted-foreground">
                  {current.subject.length}/{SUBJECT_MAX}
                </span>
              </div>
              <Input
                id="subject"
                maxLength={SUBJECT_MAX}
                value={current.subject}
                onChange={(event) => updateMessage({ subject: event.target.value })}
                placeholder="Quick idea for {name}"
              />
              <div className="flex flex-wrap gap-2">
                {SUBJECT_CHIPS.map((chip) => (
                  <Chip
                    key={chip.label}
                    label={chip.label}
                    onClick={() => updateMessage({ subject: chip.value })}
                  />
                ))}
                <Chip
                  label="Analyse subject"
                  busy={assisting === "subject"}
                  icon={<Gauge className="size-3" />}
                  onClick={() =>
                    void callAssist("subject", "Subject line review", current.subject)
                  }
                />
              </div>
              <SpamHint level={subjectSpam.level} hits={subjectSpam.hits} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="body">Message body {count > 1 ? activeMessage + 1 : ""}</Label>
                <span className="text-xs text-muted-foreground">
                  {current.body.length}/{BODY_MAX}
                </span>
              </div>
              <Textarea
                id="body"
                rows={9}
                maxLength={BODY_MAX}
                value={current.body}
                onChange={(event) => updateMessage({ body: event.target.value })}
                placeholder={"Hi {name},\n\nI noticed your store and had one idea..."}
              />
              <div className="flex flex-wrap gap-2">
                {TONE_CHIPS.map((chip) => (
                  <Chip
                    key={chip.label}
                    label={chip.label}
                    onClick={() => updateMessage({ body: chip.value })}
                  />
                ))}
              </div>
              <SpamHint level={bodySpam.level} hits={bodySpam.hits} />
              <p className="text-xs text-brand">
                Personalisation on — <code>{"{name}"}</code> becomes each contact's name.
              </p>
            </div>

            {/* Writing tools */}
            <div className="space-y-2 rounded-xl border border-border bg-surface/40 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Wand2 className="size-4 text-brand" /> Writing tools
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={assisting !== null}
                  onClick={() => void callAssist("grammar", "Grammar check", current.body)}
                >
                  {assisting === "grammar" ? (
                    <Loader2 className="mr-2 size-3.5 animate-spin" />
                  ) : (
                    <SpellCheck className="mr-2 size-3.5" />
                  )}
                  Grammar check
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={assisting !== null}
                  onClick={() =>
                    void callAssist(
                      "spam",
                      "Spam trigger check",
                      `${current.subject}\n\n${current.body}`,
                    )
                  }
                >
                  {assisting === "spam" ? (
                    <Loader2 className="mr-2 size-3.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="mr-2 size-3.5" />
                  )}
                  Spam triggers
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={assisting !== null}
                  onClick={() => void callAssist("rephrase", "Rewritten message", current.body)}
                >
                  {assisting === "rephrase" ? (
                    <Loader2 className="mr-2 size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 size-3.5" />
                  )}
                  Rephrase
                </Button>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" variant="outline" onClick={() => setPreviewOpen(true)}>
                <Eye className="mr-2 size-4" /> Preview
              </Button>
              <div className="flex gap-2">
                <Input
                  value={testTo}
                  onChange={(event) => setTestTo(event.target.value)}
                  placeholder={user?.email ?? "you@example.com"}
                  aria-label="Test address"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => test.mutate()}
                  disabled={test.isPending}
                >
                  {test.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  <span className="ml-2 hidden sm:inline">Test</span>
                </Button>
              </div>
            </div>
          </section>

          {/* Pacing */}
          <section className="panel space-y-4 p-4 sm:p-6">
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
                <p className="font-semibold">Delivery account</p>
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
                <p className="text-xs text-muted-foreground">
                  How many emails go out in one go before the app pauses. With {batchSize} per batch,
                  a list of 1,000 people is sent in small groups of {batchSize} rather than all at
                  once — this looks natural and protects your sending reputation.
                </p>
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
                <p className="text-xs text-muted-foreground">
                  Waiting time before the next {batchSize} go out — roughly{" "}
                  {compact(Math.round((batchSize * 3600) / Math.max(gapSeconds, 1)))} emails an hour.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cap">Daily limit</Label>
                <Input
                  id="cap"
                  type="number"
                  min={1}
                  max={5000}
                  value={dailyCap}
                  onChange={(event) =>
                    setDailyCap(Math.min(Number(event.target.value) || 1, 5000))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Most you'll send in one day — up to 5,000. Anything left over waits for tomorrow.
                </p>
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

          {/* Templates */}
          <section className="panel space-y-3 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold">Smart templates</h2>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setNewTemplate((v) => !v)}>
                  <Plus className="mr-1.5 size-3.5" /> Add template
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => resetTemplates.mutate()}
                  disabled={resetTemplates.isPending}
                >
                  <RotateCcw className="mr-1.5 size-3.5" /> Reset
                </Button>
              </div>
            </div>

            {newTemplate && (
              <div className="space-y-2 rounded-xl border border-border bg-surface/40 p-3">
                <Input
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                  placeholder="Template name"
                />
                <div className="flex flex-wrap gap-2">
                  {TEMPLATE_CATEGORIES.map((option) => (
                    <Chip
                      key={option}
                      label={option}
                      active={templateCategory === option}
                      onClick={() => setTemplateCategory(option)}
                    />
                  ))}
                </div>
                <Input
                  value={templateSubject}
                  onChange={(event) => setTemplateSubject(event.target.value)}
                  placeholder="Subject line — use {name} for the contact's name"
                />
                <Textarea
                  value={templateBody}
                  onChange={(event) => setTemplateBody(event.target.value)}
                  rows={7}
                  placeholder="Write the message for this template. Use {name} where the contact's name should appear."
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => saveTemplate.mutate()}
                    disabled={saveTemplate.isPending}
                  >
                    Save template
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setTemplateSubject(current.subject);
                      setTemplateBody(current.body);
                    }}
                  >
                    Copy from message {activeMessage + 1}
                  </Button>
                </div>
              </div>
            )}

            <ul className="space-y-2">
              {shownTemplates.map((item) => (
                <li
                  key={item.id}
                  className="rounded-xl border border-border bg-surface/50 p-3 text-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold">{item.name}</span>
                    <span className="text-xs font-semibold text-brand">{item.category}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.body}</p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        updateMessage({ subject: item.subject, body: item.body });
                        toast.success(`"${item.name}" loaded into message ${activeMessage + 1}.`);
                      }}
                    >
                      Use template
                    </Button>
                    {!item.id.startsWith("starter-") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeTemplate.mutate(item.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Right column */}
        <section className="space-y-4">
          <div className="panel space-y-3 bg-gradient-to-br from-brand/20 to-emerald-500/10 p-4 sm:p-6">
            <h2 className="font-display text-lg font-bold">Live dashboard</h2>
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="Sent" value={active ? active.sent : totalSent} />
              <StatCard
                label="Remaining"
                value={active ? Math.max(active.total - active.sent - active.failed, 0) : 0}
              />
            </div>
            <StatCard label="Total generated" value={active ? active.total : totalGenerated} />
            <div className="flex items-center justify-center pt-1">
              <ProgressRing
                percent={
                  active && active.total ? Math.round((active.sent / active.total) * 100) : 0
                }
              />
            </div>
          </div>

          {active ? (
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
                <StatCard
                  label="Left"
                  value={Math.max(active.total - active.sent - active.failed, 0)}
                />
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
          ) : (
            <div className="panel p-6 text-center">
              <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand/15">
                <Send className="size-5 text-brand" />
              </span>
              <p className="mt-3 font-display text-lg font-bold">Ready to launch</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add recipients, write your message, then prepare the send.
              </p>
            </div>
          )}

          <div className="panel p-4 sm:p-6">
            <h2 className="font-display text-lg font-bold">Your sends</h2>
            <ul className="mt-3 space-y-2">
              {(sends.data ?? []).length === 0 && (
                <li className="text-sm text-muted-foreground">No sends yet.</li>
              )}
              {(sends.data ?? []).map((row) => (
                <li
                  key={row.id}
                  className="flex items-center gap-2 rounded-xl border border-border bg-surface/50 px-2 py-1.5"
                >
                  <button
                    onClick={() => setActiveId(row.id)}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-1 py-1 text-left text-sm transition-colors hover:bg-accent"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{row.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {row.sent}/{row.total} sent · {row.status}
                      </span>
                    </span>
                    <Send className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete ${row.name}`}
                    title="Delete this send"
                    disabled={removeSend.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete "${row.name}"? This removes it from your sends list. Emails already sent cannot be recalled.`,
                        )
                      ) {
                        removeSend.mutate(row.id);
                      }
                    }}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Preview</DialogTitle>
            <DialogDescription>
              Exactly what {previewName} receives from {sender.from_name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 rounded-xl border border-border bg-surface/50 p-4 text-sm">
            <p className="text-xs text-muted-foreground">
              From: {sender.from_name} &lt;{senderAddress(sender)}&gt;
            </p>
            <p className="font-semibold">{personalize(current.subject, previewName) || "(no subject)"}</p>
            <p className="whitespace-pre-wrap text-muted-foreground">
              {personalize(current.body, previewName) || "(no message yet)"}
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={assist !== null} onOpenChange={(open) => !open && setAssist(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{assist?.title}</DialogTitle>
            <DialogDescription>Suggestion only — nothing changes until you apply it.</DialogDescription>
          </DialogHeader>
          <p className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-surface/50 p-4 text-sm">
            {assist?.text}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                if (assist) updateMessage({ body: assist.text });
                setAssist(null);
              }}
            >
              Use as message body
            </Button>
            <Button variant="outline" onClick={() => setAssist(null)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Chip({
  label,
  onClick,
  active = false,
  busy = false,
  icon,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  busy?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={
        active
          ? "inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1 text-xs font-bold text-brand-foreground"
          : "inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
      }
    >
      {busy ? <Loader2 className="size-3 animate-spin" /> : icon}
      {label}
    </button>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const size = 84;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(Math.max(percent, 0), 100) / 100) * circumference;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${percent}% sent`}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        className="stroke-border"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="stroke-brand"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="52%"
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-foreground text-sm font-bold"
      >
        {percent}%
      </text>
    </svg>
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
