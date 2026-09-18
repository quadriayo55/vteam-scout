const EMAIL_PATTERN = /^[^\s@,;:<>()"[\]]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+$/i;
const RAW_TAG_PATTERN = /\{[^{}\n]+\}/;
const UNRELATED_APP_LINK_PATTERN = /https?:\/\/[\w.-]*lovable\.app\b/i;

export function looksLikeEmail(value: string): boolean {
  return EMAIL_PATTERN.test(String(value ?? "").trim());
}

export function cleanHeaderValue(value: string, fallback = ""): string {
  return String(value ?? "").replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim() || fallback;
}

function rootDomain(hostname: string): string {
  const parts = hostname.toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  return parts.slice(-2).join(".");
}

export function senderMatchesLinkDomain(fromEmail: string, linkBase: string): boolean {
  const senderDomain = fromEmail.trim().toLowerCase().split("@")[1];
  if (!senderDomain) return false;
  try {
    return rootDomain(senderDomain) === rootDomain(new URL(linkBase).hostname);
  } catch {
    return false;
  }
}

export function validateRenderedEmail(input: {
  fromEmail: string;
  subject: string;
  body: string;
  linkBase: string;
}): string | null {
  if (!looksLikeEmail(input.fromEmail)) return "The sender address is not valid.";
  if (!senderMatchesLinkDomain(input.fromEmail, input.linkBase)) {
    return "The sender and unsubscribe link must use the same brand domain.";
  }
  if (!input.subject.trim()) return "The personalised subject is empty.";
  if (!input.body.trim()) return "The personalised message is empty.";
  if (RAW_TAG_PATTERN.test(input.subject) || RAW_TAG_PATTERN.test(input.body)) {
    return "The message still contains an unresolved personalisation tag.";
  }
  if (UNRELATED_APP_LINK_PATTERN.test(input.body)) {
    return "Remove the unrelated app-domain link before sending.";
  }
  return null;
}