import type { I18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import { convert } from "html-to-text";
import type { ParsedMessage } from "@/utils/types";

type CopyableMessage = Pick<
  ParsedMessage,
  "headers" | "textHtml" | "textPlain" | "attachments"
>;

/**
 * Copies messages as plain text with their headers, so the whole email —
 * who sent it, to whom, when — can be pasted in one go, e.g. into an agent.
 */
export async function copyMessages(options: {
  i18n: I18n;
  subject: string;
  messages: CopyableMessage[];
}) {
  await navigator.clipboard.writeText(formatMessagesAsText(options));
}

export function formatMessagesAsText({
  subject,
  messages,
  i18n,
}: {
  i18n: I18n;
  subject: string;
  messages: CopyableMessage[];
}) {
  const sections = messages.map((message) => {
    const { from, to, cc, date } = message.headers;
    const attachments = (message.attachments ?? [])
      .map((attachment) => attachment.filename)
      .filter(Boolean);

    const headerLines = [
      t(i18n)`From: ${from}`,
      to ? t(i18n)`To: ${to}` : null,
      cc ? t(i18n)`Cc: ${cc}` : null,
      date ? t(i18n)`Date: ${formatCopyDate(date, i18n)}` : null,
      attachments.length
        ? t(i18n)`Attachments: ${attachments.join(", ")}`
        : null,
    ].filter(Boolean);

    return `${headerLines.join("\n")}\n\n${getBodyText(message)}`;
  });

  return [t(i18n)`Subject: ${subject}`, ...sections].join("\n\n---\n\n");
}

// HTML first, like the reader, so links shown in the email keep their URLs.
function getBodyText(message: CopyableMessage) {
  if (!message.textHtml?.trim()) return message.textPlain?.trim() ?? "";
  return convert(message.textHtml, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
      { selector: "img", format: "skip" },
    ],
  }).trim();
}

function formatCopyDate(date: string, i18n: I18n) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return i18n.date(parsed, { dateStyle: "full", timeStyle: "short" });
}
