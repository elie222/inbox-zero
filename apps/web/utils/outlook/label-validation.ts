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

  return sanitized.slice(0, OUTLOOK_CATEGORY_MAX_LENGTH).trim();
}

export function normalizeOutlookCategoryName(name: string): string {
  return sanitizeOutlookCategoryName(name)
    .toLowerCase()
    .replace(/[-_.]/g, " ")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
