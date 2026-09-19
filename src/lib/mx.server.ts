/**
 * Receiving-server check.
 *
 * Most bounces come from addresses whose domain cannot accept mail at all
 * (typos, dead shops, parked domains). Every bounce damages the sending
 * reputation and pushes later messages towards spam, so each domain is looked
 * up once before the first email goes to it. Domains with no mail server are
 * remembered so the whole list is skipped instantly afterwards.
 */

const cache = new Map<string, { ok: boolean; at: number }>();
const TTL_MS = 24 * 60 * 60 * 1000;

async function lookup(domain: string, type: "MX" | "A"): Promise<boolean> {
  const response = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`,
    { headers: { accept: "application/dns-json" } },
  );
  if (!response.ok) throw new Error(`dns ${response.status}`);
  const body = (await response.json()) as { Status?: number; Answer?: Array<{ type: number }> };
  if (body.Status !== 0) return false;
  const wanted = type === "MX" ? 15 : 1;
  return (body.Answer ?? []).some((answer) => answer.type === wanted);
}

/** True when the address's domain can receive mail. Unknown results pass through. */
export async function domainAcceptsMail(email: string): Promise<boolean> {
  const domain = email.trim().toLowerCase().split("@")[1];
  if (!domain) return false;

  const cached = cache.get(domain);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.ok;

  try {
    // A mail server record is the reliable signal; a plain address record is
    // accepted as a fallback because a few small hosts still rely on it.
    const ok = (await lookup(domain, "MX")) || (await lookup(domain, "A"));
    cache.set(domain, { ok, at: Date.now() });
    return ok;
  } catch {
    // Never block a send because the lookup itself failed.
    return true;
  }
}
