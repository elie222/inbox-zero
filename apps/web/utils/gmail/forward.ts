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
  return `<div>${content}</div>
<br />
<div>
---------- Forwarded message ----------<br>
From: ${message.headers.from}<br>
Date: ${message.headers.date}<br>
Subject: ${message.headers.subject}<br>
To: ${message.headers.to}<br>
</div>

<br>
<br>

${message.textHtml}`;
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
