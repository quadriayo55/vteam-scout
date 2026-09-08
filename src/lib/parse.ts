import * as XLSX from "xlsx";
import {
  CHANNELS,
  type Channel,
  detectColumns,
  isValidEmail,
  normalizePhone,
  buildProfileUrl,
} from "./outreach";

/** Hard cap: a single upload may carry at most this many leads. */
export const MAX_UPLOAD_LEADS = 100_000;

export type ParsedRow = Record<string, string>;

export type ParsedFile = {
  fileName: string;
  headers: string[];
  rows: string[][];
  columns: Partial<Record<Channel | "name", number>>;
};

export async function parseFile(file: File): Promise<ParsedFile> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error(`${file.name} has no readable sheet.`);
  const sheet = workbook.Sheets[sheetName]!;
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: false,
  });
  const [headerRow = [], ...rest] = matrix;
  if (rest.length > MAX_UPLOAD_LEADS) {
    throw new Error(
      `${file.name} has ${rest.length.toLocaleString()} rows — the limit is ${MAX_UPLOAD_LEADS.toLocaleString()} leads per upload. Split it into smaller files.`,
    );
  }
  const headers = headerRow.map((h) => String(h ?? "").trim());
  return {
    fileName: file.name,
    headers,
    rows: rest.map((row) => row.map((cell) => String(cell ?? "").trim())),
    columns: detectColumns(headers),
  };
}

export type CandidateLink = {
  channel: Channel;
  contact_name: string | null;
  contact_handle: string;
  url: string;
  raw_row: ParsedRow;
  source_file: string;
};

export type BuildResult = {
  links: CandidateLink[];
  invalidPhones: number;
  duplicates: number;
  validRows: number;
};

export type MessageConfig = {
  subject: string;
  body: string;
  whatsappMessage: string;
  useGmail: boolean;
};

export function buildLinks(
  files: ParsedFile[],
  channels: Channel[],
  config: MessageConfig,
  makeEmailUrl: (email: string, name: string | null) => string,
  makeWhatsappUrl: (phone: string, name: string | null) => string,
): BuildResult {
  const seen = new Set<string>();
  const links: CandidateLink[] = [];
  let invalidPhones = 0;
  let duplicates = 0;
  let validRows = 0;

  for (const file of files) {
    for (const row of file.rows) {
      const raw: ParsedRow = {};
      file.headers.forEach((header, index) => {
        if (header) raw[header] = row[index] ?? "";
      });
      const nameIndex = file.columns.name;
      const name = nameIndex !== undefined ? (row[nameIndex] ?? "").trim() || null : null;
      let rowUsed = false;

      for (const channel of CHANNELS) {
        if (!channels.includes(channel)) continue;
        const index = file.columns[channel];
        if (index === undefined) continue;
        const value = (row[index] ?? "").trim();
        if (!value) continue;

        let handle: string | null = null;
        let url: string | null = null;

        if (channel === "email") {
          if (!isValidEmail(value)) continue;
          handle = value.toLowerCase();
          url = makeEmailUrl(handle, name);
        } else if (channel === "whatsapp") {
          const phone = normalizePhone(value);
          if (!phone) {
            invalidPhones += 1;
            continue;
          }
          handle = phone;
          url = makeWhatsappUrl(phone, name);
        } else {
          url = buildProfileUrl(channel, value);
          handle = url ? url.replace(/^https:\/\/www\./, "") : null;
        }

        if (!handle || !url) continue;
        const key = `${channel}:${handle.toLowerCase()}`;
        if (seen.has(key)) {
          duplicates += 1;
          continue;
        }
        seen.add(key);
        rowUsed = true;
        links.push({
          channel,
          contact_name: name,
          contact_handle: handle,
          url,
          raw_row: raw,
          source_file: file.fileName,
        });
      }
      if (rowUsed) validRows += 1;
    }
  }

  void config;
  return { links, invalidPhones, duplicates, validRows };
}
