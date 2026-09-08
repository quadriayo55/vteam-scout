export const CHANNELS = [
  "email",
  "whatsapp",
  "facebook",
  "instagram",
  "tiktok",
  "linkedin",
] as const;

export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_LABELS: Record<Channel, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
};

const HEADER_HINTS: Record<Channel, string[]> = {
  email: ["email", "e-mail", "mail", "emailaddress", "contactemail"],
  whatsapp: ["whatsapp", "whatsap", "wa", "phone", "mobile", "number", "tel", "telephone", "contact"],
  facebook: ["facebook", "fb", "fbpage", "facebookurl"],
  instagram: ["instagram", "ig", "insta", "instagramurl"],
  tiktok: ["tiktok", "tik tok", "tt", "tiktokurl"],
  linkedin: ["linkedin", "li", "linkedinurl"],
};

const NAME_HINTS = ["name", "firstname", "first name", "fullname", "full name", "contact name", "store", "storename"];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function detectColumns(headers: string[]) {
  const map: Partial<Record<Channel | "name", number>> = {};
  headers.forEach((header, index) => {
    const h = norm(header);
    if (!h) return;
    if (map.name === undefined && NAME_HINTS.some((hint) => h === norm(hint) || h.includes(norm(hint)))) {
      map.name = index;
    }
    for (const channel of CHANNELS) {
      if (map[channel] !== undefined) continue;
      if (HEADER_HINTS[channel].some((hint) => h === norm(hint) || h.includes(norm(hint)))) {
        map[channel] = index;
      }
    }
  });
  return map;
}

/** Basic international phone validation: 8-15 digits with a plausible country code. */
export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  let value = String(raw).trim().replace(/[\s()\-.]/g, "");
  if (value.startsWith("00")) value = `+${value.slice(2)}`;
  const plus = value.startsWith("+");
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  if (!plus && digits.startsWith("0")) return null; // local format, unknown country
  if (digits.startsWith("0")) return null;
  return digits;
}

export function isValidEmail(raw: string) {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(raw).trim());
}

function stripDomains(raw: string, domains: string[]) {
  let value = String(raw).trim();
  value = value.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  for (const domain of domains) {
    const pattern = new RegExp(`^(${domain})/?`, "i");
    while (pattern.test(value)) value = value.replace(pattern, "");
  }
  return value.replace(/^@/, "").replace(/^\/+/, "").replace(/\/+$/, "");
}

export function buildProfileUrl(channel: Channel, raw: string): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  switch (channel) {
    case "facebook": {
      const handle = stripDomains(value, ["facebook\\.com", "m\\.facebook\\.com", "fb\\.com"]);
      return handle ? `https://www.facebook.com/${handle}` : null;
    }
    case "instagram": {
      const handle = stripDomains(value, ["instagram\\.com"]);
      return handle ? `https://www.instagram.com/${handle}` : null;
    }
    case "tiktok": {
      let handle = stripDomains(value, ["tiktok\\.com"]);
      handle = handle.replace(/^@/, "");
      return handle ? `https://www.tiktok.com/@${handle}` : null;
    }
    case "linkedin": {
      const handle = stripDomains(value, ["linkedin\\.com"]);
      if (!handle) return null;
      return /^(in|company|school)\//i.test(handle)
        ? `https://www.linkedin.com/${handle}`
        : `https://www.linkedin.com/in/${handle}`;
    }
    default:
      return null;
  }
}

export function personalize(template: string, name: string | null) {
  return (template ?? "").replaceAll("{name}", name?.trim() || "there");
}

export function buildMailtoUrl(email: string, subject: string, body: string, name: string | null) {
  const params = new URLSearchParams({
    subject: personalize(subject, name),
    body: personalize(body, name),
  });
  return `mailto:${email}?${params.toString()}`;
}

export function buildGmailUrl(email: string, subject: string, body: string, name: string | null) {
  const params = new URLSearchParams({
    fs: "1",
    to: email,
    su: personalize(subject, name),
    body: personalize(body, name),
    tf: "cm",
  });
  return `https://mail.google.com/mail/u/0/?${params.toString()}`;
}

export function buildWhatsappUrl(phone: string, message: string, name: string | null) {
  const text = encodeURIComponent(personalize(message, name));
  return `https://wa.me/${phone}?text=${text}`;
}

export function compact(value: number) {
  if (value < 1000) return String(value);
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 })
    .format(value)
    .toLowerCase();
}

/** Spam-signal check for subject lines and bodies. */
const SPAM_WORDS = [
  "free",
  "guarantee",
  "guaranteed",
  "act now",
  "limited time",
  "click here",
  "buy now",
  "risk-free",
  "no obligation",
  "cash",
  "winner",
  "urgent",
  "100%",
  "cheap",
  "make money",
  "double your",
];

export function spamCheck(text: string) {
  const lower = (text ?? "").toLowerCase();
  const hits = SPAM_WORDS.filter((word) => lower.includes(word));
  const shouty = /[A-Z]{5,}/.test(text ?? "");
  const exclaim = (text?.match(/!/g) ?? []).length > 1;
  const score = hits.length + (shouty ? 1 : 0) + (exclaim ? 1 : 0);
  return {
    hits,
    shouty,
    exclaim,
    level: score === 0 ? ("clean" as const) : score <= 2 ? ("caution" as const) : ("risky" as const),
  };
}
