import { load, type CheerioAPI } from "cheerio";
import { emailToContent, type EmailToContentOptions } from "@/utils/mail";
import type { ParsedMessage } from "@/utils/types";

const DOCUMENT_PATTERN = /<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i;
type SanitizableNode = ReturnType<CheerioAPI> | ReturnType<CheerioAPI["root"]>;

function stripHiddenText(text: string): string {
  let result = text.replace(/\u200B|\u200C|\u200D|\u2060|\uFEFF/g, "");
  result = result.replace(/[\u202A-\u202E\u2066-\u2069]/g, "");
  return result;
}

function stripHiddenHtml(html: string): string {
  const normalizedHtml = stripHiddenText(html);
  const isDocument = DOCUMENT_PATTERN.test(normalizedHtml);
  const $ = load(normalizedHtml, null, isDocument);

  sanitizeNode($, $.root());

  return isDocument ? $.html() : ($.root().html() ?? normalizedHtml);
}

function sanitizeForAI(input: { textPlain?: string; textHtml?: string }): {
  textPlain?: string;
  textHtml?: string;
} {
  return {
    textPlain: input.textPlain
      ? stripHiddenText(input.textPlain)
      : input.textPlain,
    textHtml: input.textHtml ? stripHiddenHtml(input.textHtml) : input.textHtml,
  };
}

export function emailToContentForAI(
  email: Pick<ParsedMessage, "textHtml" | "textPlain" | "snippet">,
  contentOptions?: EmailToContentOptions,
) {
  const sanitizedContent = sanitizeForAI({
    textPlain: email.textPlain,
    textHtml: email.textHtml,
  });

  return emailToContent(
    {
      ...email,
      ...sanitizedContent,
      snippet: email.snippet ? stripHiddenText(email.snippet) : email.snippet,
    },
    contentOptions,
  );
}

function sanitizeNode($: CheerioAPI, node: SanitizableNode) {
  node.contents().each((_index, child) => {
    if (child.type === "comment") {
      $(child).remove();
      return;
    }

    if (child.type === "text") {
      child.data = stripHiddenText(child.data);
      return;
    }

    if (child.type !== "tag") return;

    const style = $(child).attr("style");
    if (style && hasHiddenInlineStyle(style)) {
      $(child).remove();
      return;
    }

    sanitizeNode($, $(child));
  });
}

function hasHiddenInlineStyle(style: string) {
  const declarations = style
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean);

  for (const declaration of declarations) {
    const separatorIndex = declaration.indexOf(":");
    if (separatorIndex === -1) continue;

    const property = declaration.slice(0, separatorIndex).trim().toLowerCase();
    const value = declaration
      .slice(separatorIndex + 1)
      .trim()
      .toLowerCase();
    const normalizedValue = normalizeStyleValue(value);

    if (property === "display" && normalizedValue === "none") return true;
    if (property === "visibility" && normalizedValue === "hidden") return true;
    if (property === "font-size" && isZeroLength(normalizedValue)) return true;
  }

  return false;
}

function normalizeStyleValue(value: string) {
  return value
    .replace(/\s*!important\s*$/i, "")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .split(/\s+/, 1)[0]
    .toLowerCase();
}

function isZeroLength(value: string) {
  return /^(?:0+|0*\.0+)(?:[a-z%]+)?$/.test(value);
}
