import { formatEmailDate } from "@/utils/gmail/reply";
import type { ParsedMessage } from "@/utils/types";

export const forwardEmailSubject = (subject: string) => {
  return `Fwd: ${subject}`;
};

export const forwardEmailHtml = ({
  content,
  message,
}: {
  content: string;
  message: ParsedMessage;
}) => {
  const quotedDate = formatEmailDate(new Date(message.headers.date));

  return `<div dir="ltr">${content}<br><br>
<div class="gmail_quote gmail_quote_container">
  <div dir="ltr" class="gmail_attr">---------- Forwarded message ----------<br>
From: ${formatFromEmailWithName(message.headers.from)}<br>
Date: ${quotedDate}<br>
Subject: ${message.headers.subject}<br>
To: ${formatToEmailWithName(message.headers.to)}<br>
</div><br><br>
${message.textHtml}
</div></div>`.trim();
};

export const forwardEmailText = ({
  content,
  message,
}: {
  content: string;
  message: ParsedMessage;
}) => {
  return `${content}
        
---------- Forwarded message ----------
From: ${message.headers.from}
Date: ${message.headers.date}
Subject: ${message.headers.subject}
To: ${message.headers.to}

${message.textPlain}`;
};

const formatFromEmailWithName = (emailHeader: string) => {
  const match = emailHeader?.match(/(.*?)\s*<([^>]+)>/);
  if (!match) return emailHeader || "";

  const [, name, email] = match;
  const trimmedName = name.trim();

  return `<strong class="gmail_sendername" dir="auto">${trimmedName}</strong> <span dir="auto">&lt;<a href="mailto:${email}">${email}</a>&gt;</span>`;
};

const formatToEmailWithName = (emailHeader: string) => {
  const match = emailHeader?.match(/(.*?)\s*<([^>]+)>/);
  if (!match) return emailHeader || "";

  const [, name, email] = match;
  const trimmedName = name.trim();

  return `${trimmedName} &lt;<a href="mailto:${email}">${email}</a>&gt;`;
};
