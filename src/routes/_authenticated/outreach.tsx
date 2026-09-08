import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useProfile } from "@/lib/auth";
import { totalsQuery } from "@/lib/stats";
import {
  CHANNELS,
  CHANNEL_LABELS,
  buildGmailUrl,
  buildMailtoUrl,
  buildWhatsappUrl,
  compact,
  spamCheck,
  type Channel,
} from "@/lib/outreach";
import { parseFile, buildLinks, type ParsedFile } from "@/lib/parse";
import { formatWat } from "@/lib/wat";
import { StatCard } from "@/components/StatCard";
import { LiveIndicator } from "@/components/LiveIndicator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Link2,
  MousePointerClick,
  Clock,
  Upload,
  Trash2,
  RefreshCw,
  Loader2,
  Search,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/outreach")({
  head: () => ({
    meta: [
      { title: "Outreach Links — Verunda Team Scoutier" },
      {
        name: "description",
        content:
          "Upload lead files and generate one-click outreach links by channel, with live clicked and pending counts.",
      },
      { property: "og:title", content: "Outreach Links — Verunda Team Scoutier" },
      {
        property: "og:description",
        content: "Upload lead files and generate one-click outreach links by channel.",
      },
    ],
  }),
  component: OutreachPage,
});

const PAGE_SIZE = 50;

type LinkRow = {
  id: string;
  channel: Channel;
  contact_name: string | null;
  contact_handle: string;
  url: string;
  source_file: string | null;
  clicked_at: string | null;
  created_at: string;
  raw_row: Record<string, string> | null;
};

function OutreachPage() {
  const { user } = useAuth();
  const profile = useProfile();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [selected, setSelected] = useState<Channel[]>([...CHANNELS]);
  const [subject, setSubject] = useState("Quick idea for {name}");
  const [body, setBody] = useState(
    "Hi {name},\n\nI took a look at your store and spotted a few quick wins worth sharing.\n\nWould it be alright if I sent over the details?\n\nBest,\nVerunda",
  );
  const [whatsappMessage, setWhatsappMessage] = useState(
    "Hi {name}, I looked at your store and noticed a few quick wins — may I share them?",
  );
  const [useGmail, setUseGmail] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const [filter, setFilter] = useState<"all" | Channel>("all");
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");

  const totals = useQuery(totalsQuery({ userId: user?.id }, "all"));

  const links = useQuery({
    queryKey: ["links", user?.id, filter, page, search],
    enabled: !!user,
    queryFn: async () => {
      let query = supabase
        .from("outreach_links")
        .select(
          "id,channel,contact_name,contact_handle,url,source_file,clicked_at,created_at,raw_row",
          { count: "exact" },
        )
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (filter !== "all") query = query.eq("channel", filter);
      if (search.trim()) query = query.ilike("contact_handle", `%${search.trim()}%`);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as LinkRow[], count: count ?? 0 };
    },
  });

  const spam = useMemo(() => spamCheck(`${subject} ${body}`), [subject, body]);

  async function onFilesPicked(list: FileList | null) {
    if (!list?.length) return;
    try {
      const parsed = await Promise.all(Array.from(list).map(parseFile));
      setFiles((prev) => [...prev, ...parsed]);
    } catch {
      toast.error("Couldn't read one of those files. Use CSV, TXT or Excel.");
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  async function generate() {
    if (!user) return;
    if (!files.length) {
      toast.error("Add at least one lead file.");
      return;
    }
    if (!selected.length) {
      toast.error("Pick at least one channel.");
      return;
    }
    setProcessing(true);
    setProgress(0);
    try {
      const result = buildLinks(
        files,
        selected,
        { subject, body, whatsappMessage, useGmail },
        (email, name) =>
          useGmail
            ? buildGmailUrl(email, subject, body, name)
            : buildMailtoUrl(email, subject, body, name),
        (phone, name) => buildWhatsappUrl(phone, whatsappMessage, name),
      );

      if (!result.links.length) {
        toast.error("No valid contacts found for the selected channels.");
        return;
      }

      const { data: upload, error: uploadError } = await supabase
        .from("uploads")
        .insert({
          user_id: user.id,
          file_name: files.map((f) => f.fileName).join(", ").slice(0, 300),
          total_rows: files.reduce((sum, f) => sum + f.rows.length, 0),
          valid_rows: result.validRows,
        })
        .select("id")
        .single();
      if (uploadError) throw uploadError;

      const BATCH = 500;
      let inserted = 0;
      for (let i = 0; i < result.links.length; i += BATCH) {
        const batch = result.links.slice(i, i + BATCH).map((link) => ({
          ...link,
          user_id: user.id,
          upload_id: upload.id,
        }));
        const { error, count } = await supabase
          .from("outreach_links")
          .upsert(batch, {
            onConflict: "user_id,channel,contact_handle",
            ignoreDuplicates: true,
            count: "exact",
          })
          .select("id");
        if (error) throw error;
        inserted += count ?? 0;
        setProgress(Math.round(((i + batch.length) / result.links.length) * 100));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      const notes = [
        `${inserted.toLocaleString()} links generated`,
        result.duplicates ? `${result.duplicates} duplicates skipped` : null,
        result.invalidPhones ? `${result.invalidPhones} invalid numbers flagged` : null,
      ].filter(Boolean);
      toast.success(notes.join(" · "));
      setFiles([]);
      setPage(0);
      queryClient.invalidateQueries();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generation failed.");
    } finally {
      setProcessing(false);
      setProgress(0);
    }
  }

  async function markClicked(row: LinkRow) {
    if (row.clicked_at) return;
    const now = new Date().toISOString();
    queryClient.setQueryData(
      ["links", user?.id, filter, page, search],
      (old: { rows: LinkRow[]; count: number } | undefined) =>
        old
          ? {
              ...old,
              rows: old.rows.map((r) => (r.id === row.id ? { ...r, clicked_at: now } : r)),
            }
          : old,
    );
    const { error } = await supabase
      .from("outreach_links")
      .update({ clicked_at: now })
      .eq("id", row.id)
      .is("clicked_at", null);
    if (error) toast.error("Click didn't save — run Sync to repair.");
    queryClient.invalidateQueries({ queryKey: ["totals"] });
    queryClient.invalidateQueries({ queryKey: ["daily"] });
  }

  const pageCount = Math.max(1, Math.ceil((links.data?.count ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Outreach Links</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One clickable entry per unique contact, organised by channel.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LiveIndicator updatedAt={totals.dataUpdatedAt} />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              queryClient.invalidateQueries();
              toast.success("Synced with the database.");
            }}
          >
            <RefreshCw className="mr-2 size-4" /> Sync
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Generated"
          value={totals.data?.generated ?? 0}
          icon={<Link2 className="size-4" />}
          loading={totals.isLoading}
        />
        <StatCard
          label="Clicked"
          value={totals.data?.clicked ?? 0}
          tone="brand"
          icon={<MousePointerClick className="size-4" />}
          loading={totals.isLoading}
        />
        <StatCard
          label="Pending"
          value={totals.data?.pending ?? 0}
          tone="success"
          icon={<Clock className="size-4" />}
          loading={totals.isLoading}
        />
        <StatCard
          label="Scouted"
          value={totals.data?.percent ?? 0}
          suffix="%"
          tone="muted"
          loading={totals.isLoading}
        />
      </div>

      {/* GENERATOR */}
      <section className="panel p-4 sm:p-6">
        <h2 className="font-display text-lg font-bold">Generate new links</h2>

        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <Label>Lead files (CSV, TXT, Excel)</Label>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept=".csv,.txt,.xlsx,.xls"
                className="hidden"
                onChange={(event) => onFilesPicked(event.target.files)}
              />
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="mt-2 flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface/40 px-4 py-7 text-sm text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
              >
                <Upload className="size-5" />
                Choose files — multiple allowed
              </button>
            </div>

            {files.length > 0 && (
              <ul className="space-y-2">
                {files.map((file, index) => (
                  <li
                    key={`${file.fileName}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface/50 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{file.fileName}</span>
                      <span className="text-xs text-muted-foreground">
                        {file.rows.length.toLocaleString()} rows ·{" "}
                        {CHANNELS.filter((c) => file.columns[c] !== undefined)
                          .map((c) => CHANNEL_LABELS[c])
                          .join(", ") || "no channels detected"}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div>
              <Label>Channels to generate</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {CHANNELS.map((channel) => {
                  const on = selected.includes(channel);
                  return (
                    <button
                      key={channel}
                      type="button"
                      onClick={() =>
                        setSelected((prev) =>
                          on ? prev.filter((c) => c !== channel) : [...prev, channel],
                        )
                      }
                      className={
                        on
                          ? "rounded-full bg-brand px-3.5 py-1.5 text-xs font-bold text-brand-foreground"
                          : "rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                      }
                    >
                      {CHANNEL_LABELS[channel]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subject">Email subject — {"{name}"} supported</Label>
              <Input
                id="subject"
                maxLength={200}
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="body">Email body</Label>
              <Textarea
                id="body"
                rows={6}
                maxLength={2000}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {body.length}/2000 ·{" "}
                {spam.level === "clean" ? (
                  <span className="text-success">no spam signals</span>
                ) : (
                  <span className={spam.level === "risky" ? "text-destructive" : "text-brand"}>
                    {spam.level === "risky" ? "high spam risk" : "check phrasing"}
                    {spam.hits.length > 0 && `: ${spam.hits.slice(0, 4).join(", ")}`}
                  </span>
                )}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wa">WhatsApp message</Label>
              <Textarea
                id="wa"
                rows={3}
                value={whatsappMessage}
                onChange={(event) => setWhatsappMessage(event.target.value)}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
              <span className="text-sm font-semibold">Open email in Gmail web compose</span>
              <Switch checked={useGmail} onCheckedChange={setUseGmail} />
            </div>
          </div>
        </div>

        {processing && <Progress value={progress} className="mt-5" />}

        <Button className="mt-5 w-full sm:w-auto" onClick={generate} disabled={processing}>
          {processing ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" /> Processing {progress}%
            </>
          ) : (
            "Generate outreach links"
          )}
        </Button>
      </section>

      {/* LINK LIST */}
      <section className="panel p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold">
            Your links{" "}
            <span className="text-sm font-medium text-muted-foreground">
              ({compact(links.data?.count ?? 0)})
            </span>
          </h2>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="relative flex-1 sm:w-56 sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search email or handle"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(0);
                }}
              />
            </div>
            <Select
              value={filter}
              onValueChange={(value) => {
                setFilter(value as "all" | Channel);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                {CHANNELS.map((channel) => (
                  <SelectItem key={channel} value={channel}>
                    {CHANNEL_LABELS[channel]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {links.isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading links…</p>
        ) : (links.data?.rows.length ?? 0) === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No links yet. Upload a lead file above to get started.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {links.data!.rows.map((row) => {
              const clicked = !!row.clicked_at;
              return (
                <li
                  key={row.id}
                  className={
                    clicked
                      ? "rounded-xl border border-destructive/50 bg-destructive/10 p-3"
                      : "rounded-xl border border-success/40 bg-success/10 p-3"
                  }
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {row.contact_name || row.contact_handle}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.contact_handle}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <Badge variant="secondary">{CHANNEL_LABELS[row.channel]}</Badge>
                        {row.source_file && <span className="truncate">{row.source_file}</span>}
                        <span>{formatWat(row.created_at)}</span>
                      </p>
                    </div>
                    {clicked ? (
                      <span className="rounded-full bg-destructive/20 px-3 py-1.5 text-xs font-bold text-destructive">
                        Clicked
                      </span>
                    ) : (
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => markClicked(row)}
                        className="rounded-full bg-success px-3.5 py-1.5 text-xs font-bold text-success-foreground"
                      >
                        Open {CHANNEL_LABELS[row.channel]}
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {pageCount > 1 && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <Button
              variant="secondary"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page + 1} of {pageCount}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page + 1 >= pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
