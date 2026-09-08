import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RoleGate } from "@/components/RoleGate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatWat } from "@/lib/wat";
import { FileSpreadsheet, Loader2, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/lead-files")({
  head: () => ({
    meta: [
      { title: "Uploaded Lead Lists — Verunda Team Scoutier" },
      {
        name: "description",
        content:
          "Review every uploaded lead list — outreach link batches, imported prospects and bulk email lists — and delete the ones you no longer want.",
      },
      { property: "og:title", content: "Uploaded Lead Lists — Verunda Team Scoutier" },
      {
        property: "og:description",
        content: "Review and delete uploaded lead lists in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RoleGate need="manageMembers">
      <LeadFilesPage />
    </RoleGate>
  ),
});

type Pending = {
  kind: "links" | "prospects" | "bulk";
  id: string;
  label: string;
  count: number;
};

function LeadFilesPage() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const uploads = useQuery({
    queryKey: ["lead-files", "uploads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("uploads")
        .select("id,file_name,total_rows,valid_rows,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      const counted = await Promise.all(
        rows.map(async (row) => {
          const { count } = await supabase
            .from("outreach_links")
            .select("id", { count: "exact", head: true })
            .eq("upload_id", row.id);
          return { ...row, links: count ?? 0 };
        }),
      );
      return counted;
    },
  });

  const batches = useQuery({
    queryKey: ["lead-files", "prospect-batches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prospects")
        .select("import_batch,source_file,created_at")
        .not("import_batch", "is", null)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      const map = new Map<string, { id: string; label: string; count: number; created_at: string }>();
      for (const row of data ?? []) {
        const id = row.import_batch as string;
        const existing = map.get(id);
        if (existing) existing.count += 1;
        else
          map.set(id, {
            id,
            label: row.source_file || "Imported list",
            count: 1,
            created_at: row.created_at,
          });
      }
      return [...map.values()];
    },
  });

  const sends = useQuery({
    queryKey: ["lead-files", "bulk-sends"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bulk_sends")
        .select("id,name,subject,total,sent,failed,status,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function confirmDelete() {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === "links") {
        const links = await supabase.from("outreach_links").delete().eq("upload_id", pending.id);
        if (links.error) throw links.error;
        const upload = await supabase.from("uploads").delete().eq("id", pending.id);
        if (upload.error) throw upload.error;
      } else if (pending.kind === "prospects") {
        const { error } = await supabase.from("prospects").delete().eq("import_batch", pending.id);
        if (error) throw error;
      } else {
        const recipients = await supabase
          .from("bulk_send_recipients")
          .delete()
          .eq("send_id", pending.id);
        if (recipients.error) throw recipients.error;
        const send = await supabase.from("bulk_sends").delete().eq("id", pending.id);
        if (send.error) throw send.error;
      }
      toast.success(`Deleted "${pending.label}" and its ${pending.count.toLocaleString()} leads.`);
      setPending(null);
      queryClient.invalidateQueries();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete that list.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold">Uploaded lead lists</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every list that came in from a file or a paste. Deleting one removes all of the leads that
          came with it.
        </p>
      </header>

      <Section
        title="Outreach link lists"
        hint="Files you turned into one-click outreach links."
        loading={uploads.isLoading}
        empty="No lead files uploaded yet."
        rows={(uploads.data ?? []).map((row) => ({
          id: row.id,
          label: row.file_name,
          count: row.links,
          countLabel: `${row.links.toLocaleString()} links`,
          meta: `${row.valid_rows.toLocaleString()} of ${row.total_rows.toLocaleString()} rows used · ${formatWat(row.created_at)}`,
          kind: "links" as const,
        }))}
        onDelete={setPending}
      />

      <Section
        title="Imported prospects"
        hint="Leads brought in through the Scouting import panel."
        loading={batches.isLoading}
        empty="No imported prospect lists yet."
        rows={(batches.data ?? []).map((row) => ({
          id: row.id,
          label: row.label,
          count: row.count,
          countLabel: `${row.count.toLocaleString()} prospects`,
          meta: formatWat(row.created_at),
          kind: "prospects" as const,
        }))}
        onDelete={setPending}
      />

      <Section
        title="Bulk email lists"
        hint="Recipient lists from your bulk email sends."
        loading={sends.isLoading}
        empty="No bulk email lists yet."
        rows={(sends.data ?? []).map((row) => ({
          id: row.id,
          label: row.name || row.subject,
          count: row.total,
          countLabel: `${row.total.toLocaleString()} recipients`,
          meta: `${row.sent.toLocaleString()} sent · ${row.failed.toLocaleString()} failed · ${formatWat(row.created_at)}`,
          kind: "bulk" as const,
        }))}
        onDelete={setPending}
      />

      <AlertDialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this list?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pending?.label}" and its {pending?.count.toLocaleString()} leads will be removed for
              good. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                confirmDelete();
              }}
              disabled={busy}
            >
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Delete leads
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Section({
  title,
  hint,
  loading,
  empty,
  rows,
  onDelete,
}: {
  title: string;
  hint: string;
  loading: boolean;
  empty: string;
  rows: {
    id: string;
    label: string;
    count: number;
    countLabel: string;
    meta: string;
    kind: Pending["kind"];
  }[];
  onDelete: (pending: Pending) => void;
}) {
  return (
    <section className="panel space-y-3 p-4 sm:p-6">
      <div>
        <h2 className="font-display text-lg font-bold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface/50 px-3 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{row.label}</p>
                  <p className="truncate text-xs text-muted-foreground">{row.meta}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{row.countLabel}</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onDelete({ kind: row.kind, id: row.id, label: row.label, count: row.count })
                  }
                >
                  <Trash2 className="mr-1.5 size-4" />
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
