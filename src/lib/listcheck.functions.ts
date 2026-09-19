import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * List cleaning at upload time.
 *
 * Every address that bounces damages the sending reputation and pushes the rest
 * of the list towards spam, so a freshly uploaded file is checked before it can
 * be sent to: addresses that are not real addresses, addresses that already
 * bounced / complained / unsubscribed, and addresses whose domain has no mail
 * server at all are reported back so the app can drop them straight away.
 */

export type ListCheckResult = {
  /** Lowercased addresses that must not be emailed, with the reason. */
  bad: { email: string; reason: string }[];
};

export const checkEmailList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { emails: string[] }) => ({
    emails: (data?.emails ?? []).slice(0, 100_000).map((value) => String(value ?? "")),
  }))
  .handler(async ({ data }): Promise<ListCheckResult> => {
    const { looksLikeEmail } = await import("./email-deliverability");
    const { domainAcceptsMail } = await import("./mx.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const bad: { email: string; reason: string }[] = [];
    const usable: string[] = [];
    const seen = new Set<string>();

    for (const raw of data.emails) {
      const email = raw.trim().toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      if (!looksLikeEmail(email)) {
        bad.push({ email, reason: "not a valid address" });
        continue;
      }
      usable.push(email);
    }

    // Already-known bad addresses (bounced, complained, unsubscribed).
    for (let index = 0; index < usable.length; index += 500) {
      const chunk = usable.slice(index, index + 500);
      const { data: rows } = await supabaseAdmin
        .from("email_suppressions")
        .select("email, reason")
        .in("email", chunk);
      for (const row of rows ?? []) {
        bad.push({ email: row.email, reason: row.reason || "previously bounced" });
      }
    }
    const known = new Set(bad.map((item) => item.email));

    // One mail-server lookup per domain, results reused for every address on it.
    const domains = new Map<string, string[]>();
    for (const email of usable) {
      if (known.has(email)) continue;
      const domain = email.split("@")[1]!;
      const list = domains.get(domain);
      if (list) list.push(email);
      else domains.set(domain, [email]);
    }

    const names = [...domains.keys()];
    for (let index = 0; index < names.length; index += 25) {
      const chunk = names.slice(index, index + 25);
      const checks = await Promise.all(
        chunk.map(async (domain) => ({
          domain,
          ok: await domainAcceptsMail(`check@${domain}`),
        })),
      );
      for (const check of checks) {
        if (check.ok) continue;
        for (const email of domains.get(check.domain) ?? []) {
          bad.push({ email, reason: "that domain cannot receive email" });
        }
      }
    }

    return { bad };
  });
