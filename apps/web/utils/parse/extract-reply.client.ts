import { splitQuotedHtml } from "@inboxzero/email-editor/core";
import { textToHtmlParagraphs } from "@/utils/string";

/**
 * Splits a mailbox draft into the reply the user wrote and the quote below it.
 * Everything before the quote stays in the reply, so reopening a draft never
 * drops what was written.
 */
export function extractDraftComposerContent(
  html: string | undefined,
  textPlain?: string,
) {
  const { editableHtml, quotedHtml } = splitQuotedHtml(html ?? "");
  const split = { draftHtml: editableHtml, originalHtml: quotedHtml };
  if (htmlHasContent(split.draftHtml)) return split;
  const fromPlain = textToHtmlParagraphs(textPlain);
  if (!fromPlain) return split;
  return { draftHtml: fromPlain, originalHtml: split.originalHtml };
}

function htmlHasContent(html: string) {
  if (!html.trim()) return false;
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (doc.body.querySelector("img, hr, picture, svg, video")) return true;
  return (doc.body.textContent ?? "").replace(/ /g, " ").trim().length > 0;
}
