import { tokenizeSearchQuery } from "@/utils/mail/tokenize-search-query";
import type { EmailLabel } from "@/providers/email-label-types";
import type { ParsedMessage } from "@/utils/types";

type SearchTerm =
  | { field: "text" | "from" | "to" | "subject"; value: string }
  | { field: "label"; value: string }
  | { field: "after"; value: number }
  | { field: "before"; value: number };

type LocalSearchQuery = { terms: SearchTerm[]; includeSpamTrash: boolean };
export type SearchMessage = Pick<
  ParsedMessage,
  | "id"
  | "threadId"
  | "headers"
  | "subject"
  | "snippet"
  | "internalDate"
  | "labelIds"
> &
  Partial<Pick<ParsedMessage, "textPlain" | "date" | "parentFolderId">>;

export function parseLocalSearch(
  query: string,
  labels: Pick<EmailLabel, "id" | "name">[],
): LocalSearchQuery | undefined {
  const tokens = tokenizeSearchQuery(query);
  if (!tokens.length || (query.match(/"/g)?.length ?? 0) % 2) return;
  const terms: SearchTerm[] = [];
  let includeSpamTrash = false;
  for (const token of tokens) {
    if (/^[-+]|[(){}*]|^(OR|AND|NOT)$/u.test(token)) return;
    const separator = token.indexOf(":");
    const field =
      separator < 0 ? "text" : token.slice(0, separator).toLowerCase();
    const raw = separator < 0 ? token : token.slice(separator + 1);
    if (!raw || (raw.includes('"') && !/^"[^"]+"$/u.test(raw))) return;
    const value = raw.replace(/^"|"$/gu, "").normalize("NFKC").toLowerCase();
    if (["text", "from", "to", "subject"].includes(field)) {
      terms.push({ field: field as "text" | "from" | "to" | "subject", value });
    } else if (field === "after" || field === "before") {
      const date = value.replaceAll("/", "-");
      if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return;
      const utc = new Date(`${date}T00:00:00Z`);
      if (
        !Number.isFinite(utc.getTime()) ||
        utc.toISOString().slice(0, 10) !== date
      )
        return;
      // Gmail interprets calendar dates at midnight PST, independent of the device timezone.
      terms.push({ field, value: Date.parse(`${date}T00:00:00-08:00`) });
    } else if (field === "in" || field === "is" || field === "label") {
      if (field === "in" && value === "anywhere") {
        includeSpamTrash = true;
        continue;
      }
      const systemLabels: Record<string, string> = {
        inbox: "INBOX",
        sent: "SENT",
        drafts: "DRAFT",
        draft: "DRAFT",
        spam: "SPAM",
        trash: "TRASH",
        unread: "UNREAD",
        starred: "STARRED",
      };
      const label =
        field === "label"
          ? (labels.find(
              (label) => label.name.normalize("NFKC").toLowerCase() === value,
            )?.id ?? systemLabels[value])
          : systemLabels[value];
      if (!label) return;
      if (label === "SPAM" || label === "TRASH") includeSpamTrash = true;
      terms.push({ field: "label", value: label });
    } else return;
  }
  return { terms, includeSpamTrash };
}

export function matchesLocalSearch(
  message: SearchMessage,
  query: LocalSearchQuery,
) {
  if (
    !query.includeSpamTrash &&
    message.labelIds?.some((label) => label === "SPAM" || label === "TRASH")
  )
    return false;
  return query.terms.every((term) => {
    if (term.field === "label")
      return message.labelIds?.includes(term.value) ?? false;
    if (term.field === "after" || term.field === "before") {
      const timestamp =
        message.internalDate && /^\d+$/u.test(message.internalDate)
          ? Number(message.internalDate)
          : Date.parse(message.internalDate || message.date || "");
      return term.field === "after"
        ? timestamp > term.value
        : timestamp < term.value;
    }
    const text =
      term.field === "text"
        ? [
            message.subject,
            message.snippet,
            message.headers.from,
            message.headers.to,
            message.headers.cc,
            message.headers.bcc,
            message.textPlain,
          ]
            .filter(Boolean)
            .join("\n")
        : term.field === "subject"
          ? message.subject
          : message.headers[term.field];
    return (text ?? "").normalize("NFKC").toLowerCase().includes(term.value);
  });
}
