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

/** Starter templates every account gets until they save their own. */
export const STARTER_TEMPLATES: Omit<TemplateRow, "id">[] = [
  {
    name: "Cold Outreach",
    category: "Sales",
    subject: "Quick idea for {name}",
    body: "Hi {name},\n\nI came across your store and was really impressed by what you're building.\n\nWe help brands like yours reach more of the right customers without extra ad spend. Would you be open to a short look at how it works?\n\nEither way, keep up the great work.",
  },
  {
    name: "Follow-up",
    category: "Follow-up",
    subject: "Following up, {name}",
    body: "Hello {name},\n\nI hope this email finds you well. I wanted to follow up on my previous note in case it slipped past your inbox.\n\nHappy to send over a two-minute summary if that's easier than a call.\n\nThank you for your time.",
  },
  {
    name: "Partnership Pitch",
    category: "Business",
    subject: "Partnering with {name}",
    body: "Hi {name},\n\nI've been following {name}'s growth and I'm genuinely impressed by the direction you're taking.\n\nWe work with a small group of partners each quarter and I think there's a natural fit here. Would it make sense to explore it?\n\nGlad to share details whenever suits you.",
  },
  {
    name: "Exclusive Offer",
    category: "Marketing",
    subject: "Something set aside for {name}",
    body: "Hi {name},\n\nWe're opening a small number of spots this month and I wanted you to have first look before we share it more widely.\n\nIf it's interesting, reply and I'll send the details across.\n\nAll the best.",
  },
];

/** Ready-made subject openers, matching the quick chips in the composer. */
export const SUBJECT_CHIPS: { label: string; value: string }[] = [
  { label: "Quick question", value: "Quick question for {name}" },
  { label: "Partnership", value: "Partnering with {name}" },
  { label: "Exclusive offer", value: "Something set aside for {name}" },
];

export const TONE_CHIPS: { label: string; value: string }[] = [
  {
    label: "Professional",
    value:
      "Hi {name},\n\nI'm reaching out because I believe there's a strong fit between what you're building and what we do.\n\nWould you be open to a brief conversation this week?\n\nKind regards,",
  },
  {
    label: "Casual",
    value:
      "Hey {name},\n\nSaw what you're doing and had to reach out — really like it.\n\nGot a quick idea that might help. Worth a two-minute read?\n\nCheers,",
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
