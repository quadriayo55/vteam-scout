import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type EmailSettings = {
  from_local: string;
  from_domain: string;
  from_name: string;
  reply_to: string | null;
};

// Matches the sender identity already proven to land in the inbox and draw real
// replies: send as support@ (the recipient-facing name), collect replies at the
// personal quadri@ address so they land somewhere that's actually read.
export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  from_local: "support",
  from_domain: "verunda.com",
  from_name: "Quadri from Verunda",
  reply_to: "quadri@verunda.com",
};

const FREE_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
]);

/** A Reply-To on a free provider while sending from a business domain is a classic spoofing/BEC pattern spam filters watch for. */
export function isReplyToRiskyFreeMail(settings: EmailSettings): boolean {
  const replyDomain = (settings.reply_to ?? "").trim().toLowerCase().split("@")[1] ?? "";
  const sendDomain = (settings.from_domain ?? "").trim().toLowerCase();
  return FREE_MAIL_DOMAINS.has(replyDomain) && replyDomain !== sendDomain;
}

/** Turns "Quadri Ayo" into "quadri" so a first name can sit in front of the domain. */
export function toLocalPart(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .split(/\s+/)[0]
      ?.replace(/[^a-z0-9._-]/g, "") ?? ""
  );
}

export function senderAddress(settings: EmailSettings) {
  return `${settings.from_local || "outreach"}@${settings.from_domain || "verunda.com"}`;
}

export function useEmailSettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["email-settings", user?.id ?? null],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<EmailSettings> => {
      const { data, error } = await supabase
        .from("email_settings")
        .select("from_local,from_domain,from_name,reply_to")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULT_EMAIL_SETTINGS;
      return {
        ...data,
        reply_to: data.reply_to?.trim() || DEFAULT_EMAIL_SETTINGS.reply_to,
      };
    },
  });
}
