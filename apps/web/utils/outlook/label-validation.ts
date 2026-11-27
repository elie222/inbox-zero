import { normalizeLabelName } from "@/utils/label/normalize-label-name";

const OUTLOOK_CATEGORY_MAX_LENGTH = 255;

export function sanitizeOutlookCategoryName(name: string): string {
  const sanitized = name
    .replace(/,/g, " ")
    .split("")
    .map((char) => {
      const code = char.charCodeAt(0);
      return code <= 31 || code === 127 ? " " : char;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();

  const boundaryCodePoint = sanitized.codePointAt(
    OUTLOOK_CATEGORY_MAX_LENGTH - 1,
  );
  const end =
    boundaryCodePoint !== undefined && boundaryCodePoint > 0xff_ff
      ? OUTLOOK_CATEGORY_MAX_LENGTH - 1
      : OUTLOOK_CATEGORY_MAX_LENGTH;
  return sanitized.slice(0, end).trim();
}

export function normalizeOutlookCategoryName(name: string): string {
  return normalizeLabelName(sanitizeOutlookCategoryName(name));
}
