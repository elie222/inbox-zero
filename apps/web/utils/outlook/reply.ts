import type { ParsedMessage } from "@/utils/types";

export const createOutlookReplyContent = ({
  textContent,
  htmlContent,
  message,
}: {
  textContent?: string;
  htmlContent?: string;
  message: Pick<ParsedMessage, "headers" | "textPlain" | "textHtml">;
}): {
  html: string;
  text: string;
} => {
  const quotedDate = formatEmailDate(new Date(message.headers.date));
  const quotedHeader = `On ${quotedDate}, ${message.headers.from} wrote:`;

  // Detect text direction from original message
  const textDirection = detectTextDirection(textContent || "");
  const dirAttribute = `dir="${textDirection}"`;

  // Format plain text version with proper quoting
  const quotedContent = message.textPlain
    ?.split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  const plainText = `${textContent}\n\n${quotedHeader}\n\n${quotedContent}`;

  // Get the message content, preserving any existing quotes
  const messageContent =
    message.textHtml || message.textPlain?.replace(/\n/g, "<br>") || "";

  // Use htmlContent if provided, otherwise convert textContent to HTML
  const contentHtml = htmlContent || textContent?.replace(/\n/g, "<br>") || "";

  // Outlook-specific font styling with Aptos as default
  const outlookFontStyle =
    "font-family: Aptos, Calibri, Arial, Helvetica, sans-serif; font-size: 11pt; color: rgb(0, 0, 0);";

  // Format HTML version with Outlook-style formatting
  const html =
    `<div ${dirAttribute} style="${outlookFontStyle}">${contentHtml}</div>
<br>
<div style="border-top: 1px solid #e1e1e1; padding-top: 10px; margin-top: 10px;">
  <div ${dirAttribute} style="font-size: 11pt; color: rgb(0, 0, 0);">${quotedHeader}<br></div>
  <div style="margin-top: 10px;">
    ${messageContent}
  </div>
</div>`.trim();

  return {
    text: plainText,
    html,
  };
};

function detectTextDirection(text: string): "ltr" | "rtl" {
  // Basic RTL detection - checks for RTL characters at the start of the text
  const rtlRegex =
    /[\u0591-\u07FF\u200F\u202B\u202E\uFB1D-\uFDFD\uFE70-\uFEFC]/;
  return rtlRegex.test(text.trim().charAt(0)) ? "rtl" : "ltr";
}

export function formatEmailDate(date: Date): string {
  const weekday = date.toLocaleString("en-US", { weekday: "short" });
  const month = date.toLocaleString("en-US", { month: "short" });
  const day = date.getDate();
  const year = date.getFullYear();
  const hour = date.getHours();
  const minute = date.getMinutes();

  // Format: "Thu, 6 Feb 2025 at 23:23"
  return `${weekday}, ${day} ${month} ${year} at ${hour}:${minute.toString().padStart(2, "0")}`;
}
