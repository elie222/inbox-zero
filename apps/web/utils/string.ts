export function truncate(str: string, length: number) {
  return str.length > length ? `${str.slice(0, length)}...` : str;
}

export function removeExcessiveWhitespace(str: string) {
  return (
    str
      // First remove all zero-width spaces, soft hyphens, and other invisible characters
      // Handle each special character separately to avoid combining character issues
      .replace(
        /\u200B|\u200C|\u200D|\u200E|\u200F|\uFEFF|\u3164|\u00AD|\u034F/g,
        " ",
      )
      // Normalize all types of line breaks to \n
      .replace(/\r\n|\r/g, "\n")
      // Then collapse multiple newlines (3 or more) into double newlines
      .replace(/\n\s*\n\s*\n+/g, "\n\n")
      // Clean up spaces around newlines (but preserve double newlines)
      .replace(/[^\S\n]*\n[^\S\n]*/g, "\n")
      // Replace multiple spaces (but not newlines) with single space
      .replace(/[^\S\n]+/g, " ")
      // Clean up any trailing/leading whitespace
      .trim()
  );
}

export function generalizeSubject(subject = "") {
  return (
    subject
      // Remove content in parentheses
      .replace(/\([^)]*\)/g, "")
      // Remove numbers and IDs
      .replace(/(?:#\d+|\b\d+\b)/g, "")
      // Clean up extra whitespace
      .replace(/\s+/g, " ")
      .trim()
  );
}

export function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`,
) {
  return count === 1 ? singular : plural;
}

export function formatBulletList(list: string[]) {
  return list.map((item) => `- ${item}`).join("\n");
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
