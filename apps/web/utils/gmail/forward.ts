import { splitRecipientList, unquoteDisplayName } from "@/utils/email";
import { formatEmailDate } from "@/utils/email/reply-quote";
import type { ParsedMessage } from "@/utils/types";
import { escapeHtml, textToHtmlParagraphs } from "@/utils/string";

export const forwardEmailSubject = (subject: string) => `Fwd: ${subject}`;

export const forwardEmailHtml = ({
  content,
  message,
}: {
  content: string;
  message: ParsedMessage;
}) => {
  const quotedDate = formatEmailDate(new Date(message.headers.date));
  const messageContent =
    message.textHtml || textToHtmlParagraphs(message.textPlain);

  // Escape content and subject to prevent prompt injection attacks
  return `<div dir="ltr">${escapeHtml(content)}<br><br>
<div class="gmail_quote gmail_quote_container">
  <div dir="ltr" class="gmail_attr">---------- Forwarded message ----------<br>
From: ${formatFromEmailWithName(message.headers.from)}<br>
Date: ${quotedDate}<br>
Subject: ${escapeHtml(message.headers.subject)}<br>
To: ${formatRecipientsWithNames(message.headers.to)}<br>
${message.headers.cc ? `Cc: ${formatRecipientsWithNames(message.headers.cc)}<br>\n` : ""}</div><br><br>
${messageContent}
</div></div>`.trim();
};

export const forwardEmailText = ({
  content,
  message,
}: {
  content: string;
  message: ParsedMessage;
}) => `${content}
        
---------- Forwarded message ----------
From: ${message.headers.from}
Date: ${message.headers.date}
Subject: ${message.headers.subject}
To: ${message.headers.to}
${message.headers.cc ? `Cc: ${message.headers.cc}\n` : ""}
${message.textPlain}`;

const formatFromEmailWithName = (emailHeader: string) => {
  const address = parseNameAndAddress(emailHeader);
  if (!address) return escapeHtml(emailHeader || "");

  return `<strong class="gmail_sendername" dir="auto">${address.name}</strong> <span dir="auto">&lt;<a href="mailto:${address.email}">${address.email}</a>&gt;</span>`;
};

const formatRecipientsWithNames = (recipientList: string) =>
  splitRecipientList(recipientList).map(formatRecipientWithName).join(", ");

const formatRecipientWithName = (recipient: string) => {
  const address = parseNameAndAddress(recipient);
  if (!address) return escapeHtml(recipient);

  return `${address.name} &lt;<a href="mailto:${address.email}">${address.email}</a>&gt;`;
};

function parseNameAndAddress(emailHeader: string) {
  const match = emailHeader?.match(/(.*?)\s*<([^>]+)>/);
  if (!match) return null;

  const [, name, email] = match;
  return {
    name: escapeHtml(unquoteDisplayName(name.trim())),
    email: escapeHtml(email),
  };
}
