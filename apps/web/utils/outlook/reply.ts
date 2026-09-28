import type { ParsedMessage } from "@/utils/types";
import { buildReplyQuote } from "@/utils/email/reply-quote";

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
  const {
    dirAttribute,
    contentHtml,
    quotedHeaderHtml,
    quotedContentHtml,
    text,
  } = buildReplyQuote({ textContent, htmlContent, message });

  const outlookFontStyle =
    "font-family: Aptos, Calibri, Arial, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0);";

  const html =
    `<div ${dirAttribute} style="${outlookFontStyle}">${contentHtml}</div>
<br>
<div style="border-top: 1px solid #e1e1e1; padding-top: 10px; margin-top: 10px;">
  <div ${dirAttribute} style="font-size: 11pt; color: rgb(0, 0, 0);">${quotedHeaderHtml}<br></div>
  <div style="margin-top: 10px;">
    ${quotedContentHtml}
  </div>
</div>`.trim();

  return { text, html };
};
