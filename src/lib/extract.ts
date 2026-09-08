import { isValidEmail } from "./outreach";

export type ExtractedContact = { email: string; contact_name: string | null };

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const NAMED_RE = /(?:"([^"]{1,60})"|([A-Za-z][A-Za-z'.\- ]{1,59}))\s*[<(]\s*([^\s<>()]+@[^\s<>()]+)\s*[>)]/g;

function cleanName(raw: string | undefined) {
  const value = (raw ?? "").trim().replace(/[,;|]+$/, "");
  if (!value) return null;
  if (value.includes("@")) return null;
  if (value.length < 2) return null;
  return value;
}

/**
 * Pulls every email address out of messy pasted content — spreadsheets, signatures,
 * "Jane Doe <jane@shop.com>" pairs, JSON dumps or comma soup — and keeps the name
 * when one sits right next to the address.
 */
export function extractContacts(text: string): {
  contacts: ExtractedContact[];
  invalid: number;
  duplicates: number;
  found: number;
} {
  const source = String(text ?? "");
  const names = new Map<string, string>();

  for (const match of source.matchAll(NAMED_RE)) {
    const email = (match[3] ?? "").toLowerCase();
    const name = cleanName(match[1] ?? match[2]);
    if (email && name && !names.has(email)) names.set(email, name);
  }

  const seen = new Set<string>();
  const contacts: ExtractedContact[] = [];
  let invalid = 0;
  let duplicates = 0;
  let found = 0;

  for (const match of source.matchAll(EMAIL_RE)) {
    found += 1;
    const email = match[0].toLowerCase().replace(/[.,;:]+$/, "");
    if (!isValidEmail(email)) {
      invalid += 1;
      continue;
    }
    if (seen.has(email)) {
      duplicates += 1;
      continue;
    }
    seen.add(email);
    contacts.push({ email, contact_name: names.get(email) ?? null });
  }

  return { contacts, invalid, duplicates, found };
}

export type ListGrade = { grade: string; score: number; note: string };

/** A quick A–F quality read on the pasted / uploaded list. */
export function gradeList(input: {
  valid: number;
  invalid: number;
  duplicates: number;
  withNames: number;
}): ListGrade {
  const total = input.valid + input.invalid + input.duplicates;
  if (total === 0) return { grade: "—", score: 0, note: "Add recipients to see your list quality." };

  const cleanliness = input.valid / total;
  const named = input.valid ? input.withNames / input.valid : 0;
  const score = Math.round(cleanliness * 75 + named * 25);
  const grade =
    score >= 90 ? "A" : score >= 78 ? "B" : score >= 65 ? "C" : score >= 50 ? "D" : "F";

  const note =
    input.invalid > 0
      ? `${input.invalid.toLocaleString()} addresses were unusable and left out.`
      : named < 0.5
        ? "Add a name column to unlock personalised greetings."
        : "Clean list — good to send.";

  return { grade, score, note };
}
