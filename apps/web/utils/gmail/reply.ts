import type { ParsedMessage } from "@/utils/types";

export const createReplyContent = ({
  content,
  message,
}: {
  content: string;
  message: Pick<ParsedMessage, "headers" | "textPlain" | "textHtml">;
}) => {
  const quotedDate = formatEmailDate(new Date(message.headers.date));
  const quotedHeader = `On ${quotedDate}, ${message.headers.from} wrote:`;

  // Detect text direction from original message
  const textDirection = detectTextDirection(message.textPlain || "");
  const dirAttribute = `dir="${textDirection}"`;

  // Format plain text version with proper quoting
  const quotedContent = message.textPlain
    ?.split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  const plainText = `${content}\n\n${quotedHeader}\n\n${quotedContent}`;

  // Format HTML version with Gmail-style quote formatting
  const htmlContent = `
    <div ${dirAttribute}>${content.replace(/\n/g, "<br>")}</div>
    <br>
    <div class="gmail_quote">
      <div ${dirAttribute} class="gmail_attr">${quotedHeader}</div>
      <blockquote class="gmail_quote" 
        style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">
        ${message.textHtml || message.textPlain?.replace(/\n/g, "<br>")}
      </blockquote>
    </div>
  `.trim();

  return {
    text: plainText,
    html: htmlContent,
  };
};

function detectTextDirection(text: string): "ltr" | "rtl" {
  // Basic RTL detection - checks for RTL characters at the start of the text
  const rtlRegex =
    /[\u0591-\u07FF\u200F\u202B\u202E\uFB1D-\uFDFD\uFE70-\uFEFC]/;
  return rtlRegex.test(text.trim().charAt(0)) ? "rtl" : "ltr";
}

function formatEmailDate(date: Date): string {
  return date.toLocaleString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: true,
  });
}
