import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type EmailSettings = {
  from_local: string;
  from_domain: string;
  from_name: string;
  reply_to: string | null;
};

export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  from_local: "outreach",
  from_domain: "verunda.com",
  from_name: "Verunda Team Scoutier",
  reply_to: "quadri@verunda.com",
};

/** Turns "Quadri Ayo" into "quadri" so a first name can sit in front of the domain. */
export function toLocalPart(value: string) {
  return value
    .toLowerCase()
    .trim()
    .split(/\s+/)[0]
    ?.replace(/[^a-z0-9._-]/g, "") ?? "";
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
      return data ?? DEFAULT_EMAIL_SETTINGS;
    },
  });
}
