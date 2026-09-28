import { load } from "cheerio";
import type { ParsedMessage } from "@/utils/types";
import { buildReplyQuote } from "@/utils/email/reply-quote";
import { convertNewlinesToBr, escapeHtml } from "@/utils/string";

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
  const { dirAttribute, quotedHeaderHtml, quotedContentHtml, text } =
    buildReplyQuote({ textContent, message });
  const contentHtml =
    htmlContent || (textContent ? renderMixedContentAsHtml(textContent) : "");

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

// Keeps HTML signature structure intact: only top-level text gets line breaks.
function renderMixedContentAsHtml(content: string): string {
  const $ = load(content, null, false);

  $.root()
    .contents()
    .each((_index, node) => {
      if (node.type !== "text") return;

      $(node).replaceWith(convertNewlinesToBr(escapeHtml(node.data)));
    });

  return $.root().html() ?? "";
}
