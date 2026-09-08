import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SiteLookup = {
  input: string;
  website: string;
  business_name: string;
  email: string;
  phone: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  linkedin: string;
  country: string;
  ok: boolean;
  note: string;
};

function toUrl(raw: string): string | null {
  const value = raw.trim().replace(/^["']|["']$/g, "");
  if (!value || /\s/.test(value)) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function titleCaseFromHost(host: string) {
  const core = host.replace(/^www\./, "").split(".")[0] ?? host;
  return core
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function firstMatch(html: string, pattern: RegExp) {
  const match = html.match(pattern);
  return match?.[1]?.trim() ?? "";
}

function socialHandle(html: string, host: string) {
  const pattern = new RegExp(`https?://(?:www\\.)?${host}/([A-Za-z0-9_.\\-/]{2,60})`, "i");
  const raw = firstMatch(html, pattern);
  if (!raw) return "";
  const cleaned = raw.replace(/[/?#].*$/, "").replace(/\/$/, "");
  if (!cleaned || /^(share|sharer|home|login|privacy|policies|help)$/i.test(cleaned)) return "";
  return cleaned;
}

const COUNTRIES = [
  "Nigeria",
  "Ghana",
  "Kenya",
  "South Africa",
  "United Kingdom",
  "United States",
  "Canada",
  "Australia",
  "Ireland",
  "India",
  "Germany",
  "France",
  "Netherlands",
  "Spain",
  "Italy",
  "United Arab Emirates",
];

async function fetchText(url: string, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VerundaScoutier/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) return { ok: false, html: "", status: response.status };
    const html = await response.text();
    return { ok: true, html: html.slice(0, 400000), status: response.status };
  } catch {
    return { ok: false, html: "", status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

function extract(input: string, website: string, html: string): SiteLookup {
  const host = new URL(website).hostname.replace(/^www\./, "");

  const emails = Array.from(
    new Set(
      (html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [])
        .map((value) => value.toLowerCase())
        .filter((value) => !/\.(png|jpe?g|gif|svg|webp|css|js)$/i.test(value))
        .filter((value) => !/(sentry|example|wixpress|no-?reply|domain\.com)/i.test(value)),
    ),
  );
  const email = emails.find((value) => value.endsWith(`@${host}`)) ?? emails[0] ?? "";

  const phoneRaw =
    firstMatch(html, /href=["']tel:([^"']{6,25})["']/i) ||
    (html.match(/\+\d[\d\s().-]{7,18}\d/g) ?? [])[0] ||
    "";
  const phone = phoneRaw.replace(/[^\d+]/g, "");

  const title =
    firstMatch(html, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i) ||
    firstMatch(html, /<title[^>]*>([^<]{2,120})<\/title>/i);
  const business_name = (title.split(/[|\-–—:·]/)[0] ?? "").trim() || titleCaseFromHost(host);

  const country = COUNTRIES.find((name) => new RegExp(`\\b${name}\\b`, "i").test(html)) ?? "";

  return {
    input,
    website,
    business_name: business_name.slice(0, 120),
    email,
    phone,
    instagram: socialHandle(html, "instagram\\.com"),
    facebook: socialHandle(html, "facebook\\.com"),
    tiktok: socialHandle(html, "tiktok\\.com").replace(/^@/, ""),
    linkedin: socialHandle(html, "linkedin\\.com"),
    country,
    ok: true,
    note: "",
  };
}

/** Reads a business website server-side and pulls out the contact details we store. */
export const lookupSites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entries: string[] }) => ({
    entries: (input.entries ?? []).slice(0, 40).map((value) => String(value).slice(0, 300)),
  }))
  .handler(async ({ data }): Promise<SiteLookup[]> => {
    const results: SiteLookup[] = [];

    for (const entry of data.entries) {
      const website = toUrl(entry);
      if (!website) {
        results.push({
          input: entry,
          website: "",
          business_name: entry.slice(0, 120),
          email: "",
          phone: "",
          instagram: "",
          facebook: "",
          tiktok: "",
          linkedin: "",
          country: "",
          ok: false,
          note: "Not a website address — added by name only.",
        });
        continue;
      }

      const home = await fetchText(website);
      if (!home.ok) {
        const host = new URL(website).hostname.replace(/^www\./, "");
        results.push({
          input: entry,
          website,
          business_name: titleCaseFromHost(host),
          email: "",
          phone: "",
          instagram: "",
          facebook: "",
          tiktok: "",
          linkedin: "",
          country: "",
          ok: false,
          note: "Site didn't respond — saved with just the address.",
        });
        continue;
      }

      let found = extract(entry, website, home.html);
      if (!found.email || !found.phone) {
        const contactPath = /href=["']([^"']*\/?(contact|contact-us|about)[^"']*)["']/i.exec(
          home.html,
        )?.[1];
        if (contactPath) {
          try {
            const contactUrl = new URL(contactPath, website).toString();
            const contact = await fetchText(contactUrl, 7000);
            if (contact.ok) {
              const extra = extract(entry, website, contact.html);
              found = {
                ...found,
                email: found.email || extra.email,
                phone: found.phone || extra.phone,
                instagram: found.instagram || extra.instagram,
                facebook: found.facebook || extra.facebook,
                tiktok: found.tiktok || extra.tiktok,
                linkedin: found.linkedin || extra.linkedin,
                country: found.country || extra.country,
              };
            }
          } catch {
            // ignore a bad contact link and keep what the homepage gave us
          }
        }
      }

      results.push(found);
    }

    return results;
  });
