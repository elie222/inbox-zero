// Minimal vCard 3.0 support: enough for iOS/macOS Contacts round-trips.
// We own name/email/phones/title/org; everything else a client sends is
// ignored rather than stored.

import type { ContactPhone } from "@/utils/contacts";

export type VCardContact = {
  uid: string;
  email: string;
  name: string | null;
  phones: ContactPhone[];
  title: string | null;
  companyName: string | null;
  updatedAt: Date;
};

export function generateVCard(contact: VCardContact): string {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `UID:${escapeValue(contact.uid)}`,
    `FN:${escapeValue(contact.name || contact.email)}`,
    `N:${escapeValue(lastName(contact.name))};${escapeValue(firstNames(contact.name))};;;`,
    `EMAIL;TYPE=INTERNET:${escapeValue(contact.email)}`,
    ...contact.phones.map(
      (phone) =>
        `TEL;TYPE=${vcardTypeFromLabel(phone.label)}:${escapeValue(phone.value)}`,
    ),
    ...(contact.companyName ? [`ORG:${escapeValue(contact.companyName)}`] : []),
    ...(contact.title ? [`TITLE:${escapeValue(contact.title)}`] : []),
    `REV:${contact.updatedAt.toISOString()}`,
    "END:VCARD",
  ];
  return `${lines.join("\r\n")}\r\n`;
}

export type ParsedVCard = {
  uid: string | null;
  email: string | null;
  name: string | null;
  phones: ContactPhone[];
  title: string | null;
  companyName: string | null;
};

export function parseVCard(raw: string): ParsedVCard {
  // Unfold continuation lines (RFC 2425: lines starting with space/tab)
  const unfolded = raw.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);

  const result: ParsedVCard = {
    uid: null,
    email: null,
    name: null,
    phones: [],
    title: null,
    companyName: null,
  };

  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const propName = line.slice(0, colonIndex);
    const key = propName.split(";")[0].toUpperCase();
    const value = unescapeValue(line.slice(colonIndex + 1).trim());
    if (!value) continue;

    switch (key) {
      case "UID":
        result.uid = value;
        break;
      case "FN":
        result.name = value;
        break;
      case "EMAIL":
        // First email wins (iOS lists the preferred one first)
        if (!result.email) result.email = value.toLowerCase();
        break;
      case "TEL":
        result.phones.push({
          label: labelFromVcardParams(propName),
          value,
        });
        break;
      case "TITLE":
        result.title = value;
        break;
      case "ORG":
        result.companyName = value.split(";")[0] || null;
        break;
      default:
        break;
    }
  }

  return result;
}

export function contactEtag(updatedAt: Date): string {
  return `"${updatedAt.getTime()}"`;
}

function escapeValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function unescapeValue(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

// "TEL;type=CELL;type=pref" → the vCard TYPE params carry the kind of line
const VCARD_TYPE_LABELS: Record<string, string> = {
  CELL: "Mobile",
  WORK: "Work",
  HOME: "Home",
  MAIN: "Main",
  FAX: "Fax",
  PAGER: "Pager",
};

function labelFromVcardParams(propName: string): string {
  const params = propName.split(";").slice(1);
  for (const param of params) {
    const raw = (
      param.includes("=") ? param.split("=")[1] : param
    ).toUpperCase();
    for (const type of raw.split(",")) {
      const label = VCARD_TYPE_LABELS[type.trim()];
      if (label) return label;
    }
  }
  return "Other";
}

function vcardTypeFromLabel(label: string): string {
  const normalized = label.trim().toLowerCase();
  const match = Object.entries(VCARD_TYPE_LABELS).find(
    ([, human]) => human.toLowerCase() === normalized,
  );
  if (match) return match[0];
  if (normalized === "cell" || normalized === "mobile") return "CELL";
  if (normalized === "office") return "WORK";
  return "VOICE";
}

function lastName(name: string | null): string {
  const parts = name?.trim().split(/\s+/) ?? [];
  return parts.length > 1 ? (parts.at(-1) ?? "") : "";
}

function firstNames(name: string | null): string {
  const parts = name?.trim().split(/\s+/) ?? [];
  return parts.length > 1 ? parts.slice(0, -1).join(" ") : (parts[0] ?? "");
}
