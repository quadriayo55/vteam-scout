import { useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { lookupSites, type SiteLookup } from "@/lib/prospect-lookup.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Sparkles, Upload } from "lucide-react";

type Draft = {
  business_name: string;
  website: string;
  country: string;
  email: string;
  phone: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  linkedin: string;
  note: string;
  source: string;
};

const HINTS: Record<keyof Omit<Draft, "note">, string[]> = {
  business_name: ["business", "company", "name", "brand", "store", "shop"],
  website: ["website", "site", "domain", "url", "web"],
  country: ["country", "location", "region"],
  email: ["email", "mail"],
  phone: ["phone", "whatsapp", "mobile", "tel", "number"],
  instagram: ["instagram", "ig"],
  facebook: ["facebook", "fb"],
  tiktok: ["tiktok"],
  linkedin: ["linkedin"],
};

function pick(headers: string[], keys: string[]) {
  const lower = headers.map((h) => h.toLowerCase());
  for (const key of keys) {
    const index = lower.findIndex((header) => header.includes(key));
    if (index >= 0) return index;
  }
  return -1;
}

function emptyDraft(): Draft {
  return {
    business_name: "",
    website: "",
    country: "",
    email: "",
    phone: "",
    instagram: "",
    facebook: "",
    tiktok: "",
    linkedin: "",
    note: "",
    source: "",
  };
}

function fromLookup(found: SiteLookup): Draft {
  return {
    business_name: found.business_name,
    website: found.website,
    country: found.country,
    email: found.email,
    phone: found.phone,
    instagram: found.instagram,
    facebook: found.facebook,
    tiktok: found.tiktok,
    linkedin: found.linkedin,
    note: found.note,
    source: "Pasted list",
  };
}

export function ProspectImport({
  people,
  campaigns,
  userId,
  onDone,
}: {
  people: { id: string; display_name: string; email: string }[];
  campaigns: { id: string; name: string }[];
  userId: string | null;
  onDone: () => void;
}) {
  const runLookup = useServerFn(lookupSites);
  const [pasted, setPasted] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [assignedTo, setAssignedTo] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [score, setScore] = useState("60");

  async function lookupPasted() {
    const entries = Array.from(
      new Set(
        pasted
          .split(/[\n,;]+/)
          .map((line) => line.trim())
          .filter(Boolean),
      ),
    );
    if (entries.length === 0) {
      toast.error("Paste at least one business website.");
      return;
    }
    setBusy(true);
    try {
      const found = await runLookup({ data: { entries } });
      setDrafts((prev) => [...prev, ...found.map(fromLookup)]);
      const withEmail = found.filter((row) => row.email).length;
      toast.success(`Looked up ${found.length} — found an email for ${withEmail}.`);
      setPasted("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't look those up.");
    } finally {
      setBusy(false);
    }
  }

  async function loadFile(file: File) {
    setBusy(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", raw: false });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error("That file has no readable sheet.");
      const matrix = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[sheetName]!, {
        header: 1,
        blankrows: false,
        defval: "",
        raw: false,
      });
      const [headerRow = [], ...rows] = matrix;
      const headers = headerRow.map((cell) => String(cell ?? "").trim());
      const index = Object.fromEntries(
        Object.entries(HINTS).map(([key, keys]) => [key, pick(headers, keys)]),
      ) as Record<keyof Omit<Draft, "note">, number>;

      const parsed: Draft[] = [];
      for (const row of rows) {
        const value = (key: keyof Omit<Draft, "note">) =>
          index[key] >= 0 ? String(row[index[key]] ?? "").trim() : "";
        const draft: Draft = {
          ...emptyDraft(),
          business_name: value("business_name"),
          website: value("website"),
          country: value("country"),
          email: value("email"),
          phone: value("phone"),
          instagram: value("instagram"),
          facebook: value("facebook"),
          tiktok: value("tiktok"),
          linkedin: value("linkedin"),
          source: file.name,
        };
        if (!draft.business_name && !draft.website && !draft.email) continue;
        if (!draft.business_name) draft.business_name = draft.website || draft.email;
        parsed.push(draft);
      }
      if (parsed.length === 0) {
        toast.error("Couldn't find any leads in that file.");
        return;
      }
      setDrafts((prev) => [...prev, ...parsed]);
      toast.success(`${parsed.length} leads read from ${file.name}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't read that file.");
    } finally {
      setBusy(false);
    }
  }

  async function fillMissing() {
    const targets = drafts
      .map((draft, position) => ({ draft, position }))
      .filter(({ draft }) => draft.website && (!draft.email || !draft.phone))
      .slice(0, 40);
    if (targets.length === 0) {
      toast.success("Nothing left to look up.");
      return;
    }
    setBusy(true);
    try {
      const found = await runLookup({ data: { entries: targets.map((t) => t.draft.website) } });
      setDrafts((prev) => {
        const next = [...prev];
        targets.forEach(({ position }, i) => {
          const extra = found[i];
          const current = next[position];
          if (!extra || !current) return;
          next[position] = {
            ...current,
            business_name: current.business_name || extra.business_name,
            country: current.country || extra.country,
            email: current.email || extra.email,
            phone: current.phone || extra.phone,
            instagram: current.instagram || extra.instagram,
            facebook: current.facebook || extra.facebook,
            tiktok: current.tiktok || extra.tiktok,
            linkedin: current.linkedin || extra.linkedin,
          };
        });
        return next;
      });
      toast.success(`Filled in details for ${targets.length}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't look those up.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (drafts.length === 0) {
      toast.error("Nothing to import yet.");
      return;
    }
    setSaving(true);
    try {
      const batchId =
        typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : null;
      const rows = drafts.map((draft) => ({
        business_name: draft.business_name.slice(0, 120) || "Unnamed business",
        website: draft.website || null,
        country: draft.country || null,
        notes: draft.note || null,
        email: draft.email || null,
        phone: draft.phone || null,
        instagram: draft.instagram || null,
        facebook: draft.facebook || null,
        tiktok: draft.tiktok || null,
        linkedin: draft.linkedin || null,
        score: Math.min(100, Math.max(0, Number(score) || 60)),
        stage: "new",
        assigned_to: assignedTo || null,
        campaign_id: campaignId || null,
        created_by: userId,
        import_batch: batchId,
        source_file: draft.source || "Pasted list",
      }));
      const { error } = await supabase.from("prospects").insert(rows);
      if (error) throw error;
      toast.success(`${rows.length} prospects imported.`);
      setDrafts([]);
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't import those prospects.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel space-y-5 p-4 sm:p-6">
      <div>
        <h2 className="font-display text-lg font-bold">Import prospects</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a lead file, or paste business websites and let Scoutier fill in the contact
          details it can find.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="import-file">Upload a lead file (CSV or Excel)</Label>
          <Input
            id="import-file"
            type="file"
            accept=".csv,.xlsx,.xls,.tsv,.txt"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) loadFile(file);
              event.target.value = "";
            }}
          />
          <p className="text-xs text-muted-foreground">
            Columns like business, website, email, phone, country, Instagram or Facebook are picked
            up automatically.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="import-paste">Or paste business websites — one per line</Label>
          <Textarea
            id="import-paste"
            rows={4}
            value={pasted}
            placeholder={"mystore.com\nanotherbrand.co.uk"}
            onChange={(event) => setPasted(event.target.value)}
          />
          <Button size="sm" variant="secondary" onClick={lookupPasted} disabled={busy}>
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
            Look them up
          </Button>
        </div>
      </div>

      {drafts.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Assign to scout</Label>
              <Select
                value={assignedTo || "none"}
                onValueChange={(value) => setAssignedTo(value === "none" ? "" : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No scout" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No scout</SelectItem>
                  {people.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.display_name || person.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Campaign</Label>
              <Select
                value={campaignId || "none"}
                onValueChange={(value) => setCampaignId(value === "none" ? "" : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No campaign" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No campaign</SelectItem>
                  {campaigns.map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="import-score">Starting fit score</Label>
              <Input
                id="import-score"
                type="number"
                min={0}
                max={100}
                value={score}
                onChange={(event) => setScore(event.target.value)}
              />
            </div>
          </div>

          <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-border p-2">
            {drafts.map((draft, position) => (
              <div
                key={`${draft.business_name}-${position}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface/50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {draft.business_name || "Unnamed business"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[draft.website, draft.email, draft.phone, draft.country]
                      .filter(Boolean)
                      .join(" · ") || "No details found"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {draft.email ? (
                    <Badge variant="secondary">Email found</Badge>
                  ) : (
                    <Badge variant="outline">No email</Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDrafts((prev) => prev.filter((_, i) => i !== position))}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={saving || busy}>
              {saving ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Upload className="mr-2 size-4" />
              )}
              Import {drafts.length} prospect{drafts.length === 1 ? "" : "s"}
            </Button>
            <Button variant="secondary" onClick={fillMissing} disabled={busy || saving}>
              Fill in missing details
            </Button>
            <Button variant="ghost" onClick={() => setDrafts([])} disabled={saving}>
              Clear list
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
