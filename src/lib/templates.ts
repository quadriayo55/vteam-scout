import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TemplateRow = {
  id: string;
  name: string;
  category: string;
  subject: string;
  body: string;
};

export const TEMPLATE_CATEGORIES = ["Sales", "Marketing", "Business", "Follow-up"] as const;

/**
 * Starter templates every account gets until they save their own.
 *
 * Kept deliberately free of classic cold-email tropes ("came across your
 * store", "impressed by what you're building") and manufactured urgency
 * ("limited spots", "before we share it more widely") — both read as
 * templated to spam classifiers even after {name} is filled in, and
 * manufactured scarcity is itself a pattern filters weight heavily.
 * {brand}/{domain} are deliberately not used mid-sentence here: the merge
 * cleanup in merge.ts only tidies a dropped tag sitting right before
 * punctuation, so a missing value elsewhere leaves a broken sentence.
 */
export const STARTER_TEMPLATES: Omit<TemplateRow, "id">[] = [
  {
    name: "Cold Outreach",
    category: "Sales",
    subject: "A quick note",
    body: "Hi {name},\n\nI took a proper look at what you're building before writing this — I like the direction it's headed in.\n\nI help stores at a similar stage turn more of their existing traffic into customers, without raising ad spend. Worth a short look, or is the timing off right now?\n\nEither way, good luck with it.",
  },
  {
    name: "Follow-up",
    category: "Follow-up",
    subject: "Circling back",
    body: "Hi {name},\n\nWanted to bump this back up in case it got buried under everything else this week.\n\nHappy to send a short two-minute rundown if that's easier than a full read — just say the word.\n\nNo worries at all if now isn't the right time.",
  },
  {
    name: "Partnership Pitch",
    category: "Business",
    subject: "A partnership idea",
    body: "Hi {name},\n\nI've been keeping an eye on what you're building for a while and like where it's headed.\n\nWe work closely with a small number of partners at a time, and I think there could be a real fit here. Open to a short conversation about what that would look like?\n\nAppreciate you taking the time to read this.",
  },
  {
    name: "Introduction",
    category: "Business",
    subject: "Introducing myself",
    body: "Hi {name},\n\nI don't think we've spoken before, so I wanted to introduce myself directly rather than send something generic.\n\nI help stores like yours get more from the traffic they already have. If it'd be useful to trade a few ideas, I'd enjoy the conversation — and if not, no hard feelings.\n\nThanks for reading this far.",
  },
];

/** Ready-made subject openers, matching the quick chips in the composer. */
export const SUBJECT_CHIPS: { label: string; value: string }[] = [
  { label: "A quick note", value: "A quick note" },
  { label: "Working together", value: "Working together" },
  { label: "Circling back", value: "Circling back" },
];

export const TONE_CHIPS: { label: string; value: string }[] = [
  {
    label: "Professional",
    value:
      "Hi {name},\n\nI'll keep this short — what we do could genuinely help with what you're building, and I wanted to reach out directly rather than through a generic list.\n\nWould a brief conversation this week make sense?\n\nKind regards,",
  },
  {
    label: "Casual",
    value:
      "Hey {name},\n\nSaw what you're doing and had to say — really like it.\n\nGot a quick idea that might help. Worth a two-minute read?\n\nCheers,",
  },
  {
    label: "Invitation",
    value:
      "Hi {name},\n\nI'd like to invite you to something small we're putting together for a handful of brands like yours.\n\nIf you'd like the details, just reply and I'll send them over.\n\nWarm wishes,",
  },
];

export function useTemplates(userId: string | undefined) {
  return useQuery({
    queryKey: ["email-templates", userId ?? null],
    enabled: Boolean(userId),
    queryFn: async (): Promise<TemplateRow[]> => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("id,name,category,subject,body")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TemplateRow[];
    },
  });
}

export type Rotation = "alternate" | "blocks" | "split";

/** Which message variant a recipient at this position should receive. */
export function variantFor(
  index: number,
  count: number,
  rotation: Rotation,
  size: number,
  total: number,
): number {
  if (count <= 1) return 0;
  if (rotation === "blocks") {
    const block = Math.max(1, size);
    return Math.floor(index / block) % count;
  }
  if (rotation === "split") {
    const per = Math.ceil(Math.max(total, 1) / count);
    return Math.min(count - 1, Math.floor(index / Math.max(per, 1)));
  }
  return index % count;
}
