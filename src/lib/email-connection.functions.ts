import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

export type ResendDomain = {
  id: string;
  name: string;
  status: string;
  region: string | null;
};

export type ResendStatus = {
  connected: boolean;
  message: string;
  domains: ResendDomain[];
};

/** Reports whether the Resend account is linked and which sending domains it has. */
export const getResendStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<ResendStatus> => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const resendKey = process.env["RESEND_API_KEY"];
    if (!lovableKey || !resendKey) {
      return {
        connected: false,
        message: "No email account is linked to this project yet.",
        domains: [],
      };
    }

    const response = await fetch(`${GATEWAY_URL}/domains`, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": resendKey,
      },
    });
    const bodyText = await response.text();
    if (!response.ok) {
      console.error(`[resend-status] failed [${response.status}]: ${bodyText}`);
      return {
        connected: false,
        message: `Email account reachable but returned ${response.status}: ${bodyText.slice(0, 200)}`,
        domains: [],
      };
    }

    let parsed: { data?: Array<Record<string, unknown>> } = {};
    try {
      parsed = JSON.parse(bodyText) as { data?: Array<Record<string, unknown>> };
    } catch {
      parsed = {};
    }

    const domains: ResendDomain[] = (parsed.data ?? []).map((item) => ({
      id: String(item["id"] ?? ""),
      name: String(item["name"] ?? ""),
      status: String(item["status"] ?? "unknown"),
      region: item["region"] ? String(item["region"]) : null,
    }));

    return {
      connected: true,
      message: domains.length
        ? `${domains.length} sending domain${domains.length === 1 ? "" : "s"} found.`
        : "Connected, but no sending domain has been added in Resend yet.",
      domains,
    };
  });

/** Sends a single test email using the chosen sender, so the setup can be checked before a real batch. */
export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { to: string; fromName: string; fromEmail: string; replyTo?: string }) => {
    const to = (input?.to ?? "").trim();
    const fromEmail = (input?.fromEmail ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("Enter a valid test address.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) throw new Error("The sender address is not valid.");
    return {
      to,
      fromEmail,
      fromName: (input?.fromName ?? "").trim() || "Verunda",
      replyTo: (input?.replyTo ?? "").trim() || fromEmail,
    };
  })
  .handler(async ({ data, context }): Promise<{ id: string | null }> => {
    // Use the same delivery path as bulk and follow-up messages so the test
    // exercises the real validation, suppression, unsubscribe and MIME setup.
    const { claimEmailSendSlot } = await import("./email-warmup.server");
    const slot = await claimEmailSendSlot(context.userId);
    if (!slot.allowed) {
      throw new Error(
        slot.reason === "daily_limit"
          ? "Today's shared email limit has been reached."
          : "Please wait a few seconds before sending another test.",
      );
    }
    const { sendOneEmail } = await import("./resend.server");
    const result = await sendOneEmail({
      fromName: data.fromName,
      fromEmail: data.fromEmail,
      replyTo: data.replyTo,
      to: data.to,
      subject: "A quick hello from Verunda",
      body: "Hi there,\n\nThis is a quick note to confirm that replies and email delivery are working correctly.\n\nBest,\nQuadri",
      context: { email: data.to },
    });

    if (!result.ok) throw new Error(result.error);
    return { id: result.id };
  });
