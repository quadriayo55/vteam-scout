import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { runFollowupsNow } from "@/lib/followups.functions";
import { useSequences, useSteps, stepTiming } from "@/lib/followups";
import { missingTags, normalizeKey } from "@/lib/merge";
import { localSendTime } from "@/lib/schedule";
import { useTimeZone, formatIn } from "@/lib/tz";
import { RoleGate } from "@/components/RoleGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { StatCard } from "@/components/StatCard";
import {
  AlertTriangle,
  CalendarClock,
  Loader2,
  Pencil,
  Play,
  Plus,
  Repeat,
  Save,
  Trash2,
  Users,
} from "lucide-react";


export const Route = createFileRoute("/_authenticated/followups")({
  head: () => ({
    meta: [
      { title: "Follow Ups — Verunda Team Scoutier" },
      {
        name: "description",
        content:
          "Schedule automatic follow-up emails to the people who have not replied yet, with your own delays, send times and rotating messages.",
      },
      { property: "og:title", content: "Follow Ups — Verunda Team Scoutier" },
      {
        property: "og:description",
        content: "Automatic follow-ups to non-responders, on your schedule.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RoleGate need="sendBulkEmail">
      <FollowupsPage />
    </RoleGate>
  ),
});

type Draft = { subject: string; body: string };
type StepDraft = {
  delayDays: number;
  anchor: "previous" | "original";
  messages: Draft[];
  rotation: "alternate" | "blocks" | "random";
  rotationSize: number;
};

const MAX_MESSAGES = 10;

const emptyStep = (): StepDraft => ({
  delayDays: 3,
  anchor: "previous",
  messages: [{ subject: "", body: "" }],
  rotation: "alternate",
  rotationSize: 10,
});

function FollowupsPage() {
  const { user } = useAuth();
  const tz = useTimeZone();
  const queryClient = useQueryClient();
  const runNow = useServerFn(runFollowupsNow);

  const [sendId, setSendId] = useState("");
  const [name, setName] = useState("");
  const [hour, setHour] = useState(10);
  const [minute, setMinute] = useState(0);
  const [nonResponders, setNonResponders] = useState(true);
  const [skipReplied, setSkipReplied] = useState(true);
  const [skipClicked, setSkipClicked] = useState(true);
  const [skipOpened, setSkipOpened] = useState(false);
  const [batchSize] = useState(4);
  const [gapSeconds] = useState(15);
  const [steps, setSteps] = useState<StepDraft[]>([emptyStep()]);
  const [openSequence, setOpenSequence] = useState<string | null>(null);

  const sends = useQuery({
    queryKey: ["bulk-sends-for-followups", user?.id ?? null],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bulk_sends")
        .select("id,name,subject,total,sent,merge_keys,created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const sequences = useSequences(user?.id);
  const stepsOf = useSteps(openSequence);

  // Saved follow-up messages you can reuse, edit and delete.
  const templates = useQuery({
    queryKey: ["followup-templates", user?.id ?? null],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("id,name,subject,body")
        .eq("category", "Follow-up")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [tplName, setTplName] = useState("");
  const [tplSubject, setTplSubject] = useState("");
  const [tplBody, setTplBody] = useState("");

  function resetTemplateForm() {
    setEditingId(null);
    setTplName("");
    setTplSubject("");
    setTplBody("");
  }

  const saveTemplate = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Please sign in again.");
      const payload = {
        name: tplName.trim(),
        subject: tplSubject.trim(),
        body: tplBody.trim(),
        category: "Follow-up",
      };
      if (!payload.name) throw new Error("Give this saved message a name.");
      if (!payload.subject || !payload.body) throw new Error("Add both a subject and a message.");
      if (editingId) {
        const { error } = await supabase
          .from("email_templates")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("email_templates")
          .insert({ ...payload, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      const wasEditing = Boolean(editingId);
      resetTemplateForm();
      queryClient.invalidateQueries({ queryKey: ["followup-templates"] });
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      toast.success(wasEditing ? "Saved message updated." : "Message saved for reuse.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "That could not be saved."),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      if (editingId === id) resetTemplateForm();
      queryClient.invalidateQueries({ queryKey: ["followup-templates"] });
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      toast.success("Saved message deleted.");
    },
    onError: () => toast.error("That could not be deleted."),
  });


  const chosen = (sends.data ?? []).find((item) => item.id === sendId);
  const mergeKeys = useMemo(() => {
    const raw = Array.isArray(chosen?.merge_keys) ? (chosen?.merge_keys as unknown[]) : [];
    const keys = new Set(raw.map((item) => normalizeKey(String(item))).filter(Boolean));
    ["name", "email", "brand", "store", "company", "domain", "website"].forEach((key) =>
      keys.add(key),
    );
    return [...keys].sort();
  }, [chosen]);

  const unknownTags = useMemo(
    () =>
      missingTags(
        steps.flatMap((step) => step.messages.flatMap((item) => [item.subject, item.body])),
        mergeKeys,
      ),
    [steps, mergeKeys],
  );

  function patchStep(index: number, patch: Partial<StepDraft>) {
    setSteps((list) => list.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function patchMessage(stepIndex: number, messageIndex: number, patch: Partial<Draft>) {
    setSteps((list) =>
      list.map((step, i) =>
        i === stepIndex
          ? {
              ...step,
              messages: step.messages.map((item, m) =>
                m === messageIndex ? { ...item, ...patch } : item,
              ),
            }
          : step,
      ),
    );
  }

  const create = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Please sign in again.");
      if (!sendId) throw new Error("Choose the list you already emailed.");
      if (!steps.length) throw new Error("Add at least one follow-up step.");
      for (const [index, step] of steps.entries()) {
        const filled = step.messages.filter((item) => item.subject.trim() && item.body.trim());
        if (filled.length !== step.messages.length) {
          throw new Error(`Step ${index + 1} needs a subject and a body on every message.`);
        }
      }
      const fingerprints = new Set<string>();
      for (const [index, step] of steps.entries()) {
        for (const message of step.messages) {
          const fingerprint = `${message.subject.trim().toLowerCase()}\n${message.body.trim().toLowerCase()}`;
          if (fingerprints.has(fingerprint)) {
            throw new Error(
              `Step ${index + 1} repeats an earlier message exactly. Use different wording before scheduling.`,
            );
          }
          fingerprints.add(fingerprint);
        }
      }
      if (unknownTags.length) {
        throw new Error(
          `That list has no column for ${unknownTags.map((tag) => `{${tag}}`).join(", ")}. Fix those tags first.`,
        );
      }

      const { data: sequence, error } = await supabase
        .from("followup_sequences")
        .insert({
          user_id: user.id,
          send_id: sendId,
          name: name.trim() || `Follow ups for ${chosen?.name ?? "this list"}`,
          timezone: tz,
          send_hour: Math.max(0, Math.min(hour, 23)),
          send_minute: Math.max(0, Math.min(minute, 59)),
          audience_mode: nonResponders ? "non_responders" : "everyone",
          exclude_replied: skipReplied,
          exclude_clicked: skipClicked,
          exclude_opened: skipOpened,
          status: "active",
          batch_size: 4,
          gap_seconds: 15,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Each step is timed from whatever the writer chose: the original send or the step before it.
      let previous = new Date();
      const rows = steps.map((step, index) => {
        const wait = Math.max(0, Math.min(step.delayDays, 90));
        const from = step.anchor === "original" ? new Date() : previous;
        // A zero-day wait means "go out now", so it is due the moment it is saved.
        const at = wait === 0 ? new Date() : localSendTime(from, wait, tz, hour, minute);
        previous = at;
        return {
          sequence_id: sequence.id,
          user_id: user.id,
          position: index + 1,
          delay_days: wait,
          anchor: step.anchor,
          variants: step.messages.map((item) => ({
            subject: item.subject.slice(0, 200),
            body: item.body.slice(0, 2000),
          })),
          rotation: step.rotation,
          rotation_size: Math.max(1, Math.min(step.rotationSize, 1000)),
          status: "scheduled",
          scheduled_at: at.toISOString(),
        };
      });

      const { error: stepError } = await supabase.from("followup_steps").insert(rows);
      if (stepError) throw stepError;
      return sequence.id as string;
    },
    onSuccess: (id) => {
      setOpenSequence(id);
      setSteps([emptyStep()]);
      setName("");
      queryClient.invalidateQueries({ queryKey: ["followup-sequences"] });
      toast.success("Follow ups scheduled. They will go out automatically.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Those follow ups could not be saved."),
  });

  const stop = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("followup_sequences")
        .update({ status: "paused", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["followup-sequences"] });
      toast.success("Paused. Nothing further will be sent.");
    },
    onError: () => toast.error("That could not be paused."),
  });

  const resume = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("followup_sequences")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["followup-sequences"] });
      queryClient.invalidateQueries({ queryKey: ["followup-steps"] });
      toast.success("Continuing. Anything already due goes out shortly.");
    },
    onError: () => toast.error("That could not be continued."),
  });


  const remove = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("followup_steps").delete().eq("sequence_id", id);
      const { error } = await supabase.from("followup_sequences").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setOpenSequence(null);
      queryClient.invalidateQueries({ queryKey: ["followup-sequences"] });
      toast.success("Removed.");
    },
    onError: () => toast.error("That could not be removed."),
  });

  const runDue = useMutation({
    mutationFn: async () => await runNow({}),
    onSuccess: (summary) => {
      queryClient.invalidateQueries({ queryKey: ["followup-sequences"] });
      queryClient.invalidateQueries({ queryKey: ["followup-steps"] });
      toast.success(
        `${summary.sent} sent, ${summary.skipped} skipped, ${summary.failed} failed just now.`,
      );
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Nothing could be sent right now."),
  });

  const active = (sequences.data ?? []).filter((item) => item.status === "active").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Follow Ups</h1>
          <p className="text-sm text-muted-foreground">
            Email the people who have not replied yet, on a schedule you set.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => runDue.mutate()}
          disabled={runDue.isPending}
        >
          {runDue.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Play className="mr-2 size-4" />
          )}
          Send anything due now
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Running" value={active} icon={<Repeat className="size-4" />} tone="brand" />
        <StatCard
          label="All follow ups"
          value={sequences.data?.length ?? 0}
          icon={<CalendarClock className="size-4" />}
        />
        <StatCard
          label="Lists you have emailed"
          value={sends.data?.length ?? 0}
          icon={<Users className="size-4" />}
        />
      </div>

      <section className="space-y-4 rounded-2xl border border-border bg-surface/40 p-4 sm:p-5">
        <h2 className="text-lg font-semibold">New follow up</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>List you already emailed</Label>
            <select
              value={sendId}
              onChange={(event) => setSendId(event.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
            >
              <option value="">Choose a list…</option>
              {(sends.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} — {item.sent}/{item.total} sent
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Name this follow up</Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="September nudge"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Send time each day ({tz})</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={23}
                value={hour}
                onChange={(event) => setHour(Number(event.target.value))}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">:</span>
              <Input
                type="number"
                min={0}
                max={59}
                value={minute}
                onChange={(event) => setMinute(Number(event.target.value))}
                className="w-20"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Emails per batch</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={batchSize}
                readOnly
              />
            </div>
            <div className="space-y-1.5">
              <Label>Seconds between batches</Label>
              <Input
                type="number"
                min={15}
                max={3600}
                value={gapSeconds}
                readOnly
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Follow-ups send one email every 15 seconds and share the 5,000-email daily limit with Bulk Outreach.
          </p>
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-background/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Only people who have not responded</p>
              <p className="text-xs text-muted-foreground">
                Turn this off to email everybody on the list again.
              </p>
            </div>
            <Switch checked={nonResponders} onCheckedChange={setNonResponders} />
          </div>
          {nonResponders && (
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <Switch checked={skipReplied} onCheckedChange={setSkipReplied} /> Skip people who
                replied
              </label>
              <label className="flex items-center gap-2">
                <Switch checked={skipClicked} onCheckedChange={setSkipClicked} /> Skip people who
                clicked
              </label>
              <label className="flex items-center gap-2">
                <Switch checked={skipOpened} onCheckedChange={setSkipOpened} /> Skip people who
                opened
              </label>
            </div>
          )}
        </div>

        {steps.map((step, index) => (
          <div key={index} className="space-y-3 rounded-xl border border-border bg-background/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Step {index + 1}</p>
              {steps.length > 1 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setSteps((list) => list.filter((_, i) => i !== index))}
                >
                  <Trash2 className="mr-2 size-3.5" /> Remove step
                </Button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Wait (days)</Label>
                <Input
                  type="number"
                  min={0}
                  max={90}
                  value={step.delayDays}
                  onChange={(event) => patchStep(index, { delayDays: Number(event.target.value) })}
                />

              </div>
              <div className="space-y-1.5">
                <Label>Counted from</Label>
                <select
                  value={step.anchor}
                  onChange={(event) =>
                    patchStep(index, { anchor: event.target.value as StepDraft["anchor"] })
                  }
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                >
                  <option value="previous">The step before this one</option>
                  <option value="original">The first email</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Messages to rotate</Label>
                <Input
                  type="number"
                  min={1}
                  max={MAX_MESSAGES}
                  value={step.messages.length}
                  onChange={(event) => {
                    const next = Math.max(1, Math.min(Number(event.target.value), MAX_MESSAGES));
                    patchStep(index, {
                      messages:
                        next < step.messages.length
                          ? step.messages.slice(0, next)
                          : [
                              ...step.messages,
                              ...Array.from({ length: next - step.messages.length }, () => ({
                                subject: "",
                                body: "",
                              })),
                            ],
                    });
                  }}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Goes out {stepTiming(step.delayDays, step.anchor, index + 1)}, at {hour}:
              {String(minute).padStart(2, "0")} {tz}.
            </p>

            {step.messages.map((message, messageIndex) => (
              <div key={messageIndex} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label className="text-xs">Message {messageIndex + 1} subject</Label>
                  <div className="flex items-center gap-2">
                    <select
                      value=""
                      onChange={(event) => {
                        const picked = (templates.data ?? []).find(
                          (item) => item.id === event.target.value,
                        );
                        if (!picked) return;
                        patchMessage(index, messageIndex, {
                          subject: picked.subject,
                          body: picked.body,
                        });
                        toast.success(`"${picked.name}" attached.`);
                      }}
                      className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
                    >
                      <option value="">Use a saved message…</option>
                      {(templates.data ?? []).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(null);
                        setTplName(message.subject.trim() || `Step ${index + 1} message`);
                        setTplSubject(message.subject);
                        setTplBody(message.body);
                        toast.info("Ready to save below — give it a name.");
                      }}
                    >
                      <Save className="mr-1.5 size-3.5" /> Save
                    </Button>
                  </div>
                </div>
                <Input
                  value={message.subject}
                  onChange={(event) =>
                    patchMessage(index, messageIndex, { subject: event.target.value })
                  }
                  placeholder="Quick follow up"
                />
                <Textarea
                  rows={5}
                  value={message.body}
                  onChange={(event) =>
                    patchMessage(index, messageIndex, { body: event.target.value })
                  }
                  placeholder={"Hi {name}, just checking you saw my note about {brand}…"}
                />
              </div>
            ))}


            {step.messages.length > 1 && (
              <div className="space-y-1.5">
                <Label>How to rotate</Label>
                <select
                  value={step.rotation}
                  onChange={(event) =>
                    patchStep(index, { rotation: event.target.value as StepDraft["rotation"] })
                  }
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                >
                  <option value="alternate">One after another</option>
                  <option value="blocks">In blocks</option>
                  <option value="random">At random</option>
                </select>
              </div>
            )}
          </div>
        ))}

        {sendId && mergeKeys.length > 0 && (
          <p className="text-xs text-brand">
            Tags you can use from that list: {mergeKeys.map((key) => `{${key}}`).join(", ")}
          </p>
        )}

        {unknownTags.length > 0 && (
          <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs font-medium text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              That list has no column for {unknownTags.map((tag) => `{${tag}}`).join(", ")}. Saving
              is blocked until you fix those.
            </span>
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setSteps((list) => [...list, emptyStep()])}
          >
            <Plus className="mr-2 size-4" /> Add another step
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || !sendId || unknownTags.length > 0}
          >
            {create.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <CalendarClock className="mr-2 size-4" />
            )}
            Schedule follow ups
          </Button>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-surface/40 p-4 sm:p-5">
        <div>
          <h2 className="text-lg font-semibold">Saved follow-up messages</h2>
          <p className="text-sm text-muted-foreground">
            Write a message once, then attach it to any step with “Use a saved message”.
          </p>
        </div>

        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              value={tplName}
              onChange={(event) => setTplName(event.target.value)}
              placeholder="Second nudge"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input
              value={tplSubject}
              onChange={(event) => setTplSubject(event.target.value)}
              placeholder="Quick follow up"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Message</Label>
            <Textarea
              rows={5}
              value={tplBody}
              onChange={(event) => setTplBody(event.target.value)}
              placeholder={"Hi {name}, just checking you saw my note about {brand}…"}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => saveTemplate.mutate()} disabled={saveTemplate.isPending}>
              {saveTemplate.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Save className="mr-2 size-4" />
              )}
              {editingId ? "Update saved message" : "Save message"}
            </Button>
            {(editingId || tplName || tplSubject || tplBody) && (
              <Button type="button" variant="ghost" onClick={resetTemplateForm}>
                Clear
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          {templates.isLoading && <Loader2 className="size-5 animate-spin text-brand" />}
          {!templates.isLoading && (templates.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No saved messages yet.</p>
          )}
          {(templates.data ?? []).map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background/40 p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold">{item.name}</p>
                <p className="truncate text-xs text-muted-foreground">{item.subject}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditingId(item.id);
                    setTplName(item.name);
                    setTplSubject(item.subject);
                    setTplBody(item.body);
                  }}
                >
                  <Pencil className="mr-1.5 size-3.5" /> Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => deleteTemplate.mutate(item.id)}
                  disabled={deleteTemplate.isPending}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>



      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Your follow ups</h2>
        {sequences.isLoading && <Loader2 className="size-5 animate-spin text-brand" />}
        {!sequences.isLoading && (sequences.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing scheduled yet.</p>
        )}
        <div className="space-y-2">
          {(sequences.data ?? []).map((sequence) => (
            <div key={sequence.id} className="rounded-xl border border-border bg-surface/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  className="text-left"
                  onClick={() =>
                    setOpenSequence((current) => (current === sequence.id ? null : sequence.id))
                  }
                >
                  <p className="text-sm font-semibold">{sequence.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {sequence.audience_mode === "non_responders"
                      ? "Non-responders only"
                      : "Everyone on the list"}{" "}
                    · {sequence.send_hour}:{String(sequence.send_minute).padStart(2, "0")}{" "}
                    {sequence.timezone}
                  </p>
                </button>
                <div className="flex items-center gap-2">
                  <Badge variant={sequence.status === "active" ? "default" : "secondary"}>
                    {sequence.status}
                  </Badge>
                  {sequence.status === "active" && (
                    <Button size="sm" variant="ghost" onClick={() => stop.mutate(sequence.id)}>
                      Pause
                    </Button>
                  )}
                  {sequence.status === "paused" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resume.mutate(sequence.id)}
                      disabled={resume.isPending}
                    >
                      <Play className="mr-1.5 size-3.5" /> Continue
                    </Button>
                  )}

                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(sequence.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>

              {openSequence === sequence.id && (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  {(stepsOf.data ?? []).map((step) => (
                    <div
                      key={step.id}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm"
                    >
                      <span className="font-medium">Step {step.position}</span>
                      <span className="text-xs text-muted-foreground">
                        {step.scheduled_at ? formatIn(tz, step.scheduled_at) : "not scheduled"}
                      </span>
                      <span className="text-xs">
                        {step.sent} sent · {step.skipped} skipped · {step.failed} failed
                      </span>
                      <Badge variant="secondary">{step.status}</Badge>
                    </div>
                  ))}
                  {(stepsOf.data ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground">No steps saved.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
