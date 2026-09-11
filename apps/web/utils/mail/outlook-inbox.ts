export const OUTLOOK_INBOX_SECTIONS = [
  { name: "Focused", type: "focused" },
  { name: "Other", type: "other" },
] as const;

export type OutlookInboxSection =
  (typeof OUTLOOK_INBOX_SECTIONS)[number]["type"];

export function isOutlookInboxSection(
  value: string,
): value is OutlookInboxSection {
  return OUTLOOK_INBOX_SECTIONS.some((section) => section.type === value);
}
