import { formatEmailDate } from "@/utils/gmail/reply";
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
To: ${formatToEmailWithName(message.headers.to)}<br>
</div><br><br>
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

${message.textPlain}`;

const formatFromEmailWithName = (emailHeader: string) => {
  const match = emailHeader?.match(/(.*?)\s*<([^>]+)>/);
  if (!match) return escapeHtml(emailHeader || "");

  const [, name, email] = match;
  const safeName = escapeHtml(name.trim());
  const safeEmail = escapeHtml(email);

  return `<strong class="gmail_sendername" dir="auto">${safeName}</strong> <span dir="auto">&lt;<a href="mailto:${safeEmail}">${safeEmail}</a>&gt;</span>`;
};

const formatToEmailWithName = (emailHeader: string) => {
  const match = emailHeader?.match(/(.*?)\s*<([^>]+)>/);
  if (!match) return escapeHtml(emailHeader || "");

  const [, name, email] = match;
  const safeName = escapeHtml(name.trim());
  const safeEmail = escapeHtml(email);

  return `${safeName} &lt;<a href="mailto:${safeEmail}">${safeEmail}</a>&gt;`;
};
