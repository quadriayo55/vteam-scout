/**
 * Dynamic merge tags.
 *
 * Every column header of an uploaded list is normalised (lowercased, stripped of
 * spaces and separators) and stored on the recipient. Any {tag} written in a
 * subject or body is matched case-insensitively against those normalised keys,
 * so a new column called "Niche" is usable as {niche} straight away.
 */

export type RowData = Record<string, string>;

/** "Store Name" / "store_name" / "STORE-NAME" all become "storename". */
export function normalizeKey(header: string): string {
  return String(header ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Builds the normalised row map kept on every recipient. */
export function buildRowData(headers: string[], row: string[]): RowData {
  const data: RowData = {};
  headers.forEach((header, index) => {
    const key = normalizeKey(header);
    if (!key) return;
    const value = String(row[index] ?? "").trim();
    if (value && !data[key]) data[key] = value;
  });
  return data;
}

/** Turns "https://www.shop-name.myshopify.com/" into "Shop Name". */
export function brandFromDomain(domain: string | null | undefined): string {
  const host = (domain ?? "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "");
  if (!host) return "";
  const first = host.split(".")[0] ?? "";
  return first
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export type MergeContext = {
  row?: RowData | null;
  name?: string | null;
  brand?: string | null;
  domain?: string | null;
  email?: string | null;
};

/** Everything a tag can resolve against, keyed by normalised name. */
export function mergeValues(context: MergeContext): RowData {
  const row = context.row ?? {};
  const values: RowData = { ...row };

  const name = (context.name ?? row["name"] ?? row["firstname"] ?? row["contactname"] ?? "").trim();
  const site = (context.domain ?? row["domain"] ?? row["website"] ?? row["storeurl"] ?? "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  const brand =
    (context.brand ?? row["brand"] ?? row["store"] ?? row["storename"] ?? row["company"] ?? "").trim() ||
    brandFromDomain(site) ||
    site;

  if (name) values["name"] = name;
  if (site) {
    values["website"] = values["website"] || site;
    values["domain"] = values["domain"] || site;
  }
  if (brand) {
    values["brand"] = values["brand"] || brand;
    values["store"] = values["store"] || brand;
    values["company"] = values["company"] || brand;
  }
  if (context.email) values["email"] = values["email"] || context.email;
  return values;
}

const TAG_PATTERN = /\{([a-zA-Z0-9 _.-]{1,40})\}/g;

/** Every tag written in the text, as the writer typed it. */
export function extractTags(text: string): string[] {
  const found = new Set<string>();
  for (const match of String(text ?? "").matchAll(TAG_PATTERN)) {
    const raw = (match[1] ?? "").trim();
    if (raw) found.add(raw);
  }
  return [...found];
}

/** Tags used in the messages that no column (and no built-in) can fill. */
export function missingTags(texts: string[], availableKeys: string[]): string[] {
  const have = new Set(availableKeys.map(normalizeKey));
  have.add("name"); // {name} always has the friendly "there" fallback
  const missing = new Set<string>();
  for (const text of texts) {
    for (const tag of extractTags(text)) {
      if (!have.has(normalizeKey(tag))) missing.add(tag);
    }
  }
  return [...missing];
}

/** Replaces every {tag} from the recipient's own row. */
export function renderTemplate(template: string, context: MergeContext): string {
  const values = mergeValues(context);
  const hasName = Boolean(values["name"]);

  const text = String(template ?? "").replace(TAG_PATTERN, (whole, rawTag: string) => {
    const key = normalizeKey(rawTag);
    const value = values[key];
    if (value) return value;
    if (key === "name") return "there";
    return whole;
  });

  // Without a real name, "Hi there," reads fine but "Partnering with there" does not.
  return hasName
    ? text
    : text
        .replace(/\b(with|for|to|at)\s+there\b/gi, (_m, word: string) => `${word} you`)
        .replace(/\bthere's\b/gi, "there's");
}

/**
 * Subject lines are the strongest signal Gmail uses to file mail under Promotions.
 * Strip the marketing punctuation that trips it.
 */
export function inboxSubject(subject: string): string {
  return String(subject ?? "")
    .replace(/[\u2010-\u2015]/g, ",")
    .replace(/\s+-\s+/g, ", ")
    .replace(/[!]+/g, "")
    .replace(/[\p{Extended_Pictographic}\u2600-\u27BF]/gu, "")
    .replace(/\b[A-Z]{4,}\b/g, (word) => word[0] + word.slice(1).toLowerCase())
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .trim()
    .slice(0, 120);
}

/**
 * Plain-looking HTML twin of the text body. Sending both lets the provider
 * report opens and clicks while the message still reads like a typed email.
 */
export function plainHtmlBody(text: string): string {
  const escaped = String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const withLinks = escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    (url) => `<a href="${url}" style="color:#1155cc">${url}</a>`,
  );
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111111;white-space:pre-wrap">${withLinks}</div>`;
}
