/**
 * Convert standard Markdown to Slack mrkdwn format.
 *
 * Key differences:
 * - Bold: **text** → *text*
 * - Links: [text](url) → <url|text>
 * - Headings: # text → *text* (Slack has no heading syntax)
 * - Bullets: * item / - item → • item
 */
export function markdownToSlackMrkdwn(text: string): string {
  return (
    text
      // Links: [text](url) → <url|text>  (must come before bold conversion)
      .replace(/\[([^[\]]+)\]\(([^()]+)\)/g, "<$2|$1>")
      // Handle escaped Markdown from model outputs: \*\*text\*\* → *text*
      .replace(/\\\*\\\*(.+?)\\\*\\\*/g, "*$1*")
      // Bold: **text** → *text*
      .replace(/\*\*(.+?)\*\*/g, "*$1*")
      // Headings: # text → *text*
      .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
      // Escaped unordered list bullets: \* item / \- item → • item
      .replace(/^(\s*)\\[*-]\s+/gm, "$1• ")
      // Unordered list bullets: * item or - item → • item
      .replace(/^(\s*)[*-]\s+/gm, "$1• ")
  );
}

/**
 * Normalizes lightweight HTML that can leak into draft previews before
 * converting the result to Slack mrkdwn.
 */
export function richTextToSlackMrkdwn(text: string): string {
  const links: string[] = [];

  const normalized = text
    .replace(
      /<a\b[^>]*href=(["'])(.*?)\1[^>]*>(.*?)<\/a>/gis,
      (_match, _quote, href: string, label: string) => {
        const safeHref = sanitizeSlackLinkHref(href);
        const safeLabel = sanitizeSlackText(
          stripHtmlTags(label).trim() || href,
        );

        if (!safeHref) return safeLabel;

        const token = `SLACK_LINK_TOKEN_${links.length}`;
        links.push(`<${safeHref}|${safeLabel || safeHref}>`);
        return token;
      },
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/(p|div|blockquote|section|article)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<[^>\n]+>/g, "")
    .trim();

  const mrkdwn = markdownToSlackMrkdwn(sanitizeSlackText(normalized));

  return links.reduce(
    (result, link, index) =>
      result.replaceAll(`SLACK_LINK_TOKEN_${index}`, link),
    mrkdwn,
  );
}

function stripHtmlTags(text: string): string {
  return text.replace(/<[^>\n]+>/g, "");
}

function sanitizeSlackText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sanitizeSlackLinkHref(href: string): string | null {
  try {
    const url = new URL(href);

    if (!["http:", "https:", "mailto:"].includes(url.protocol)) {
      return null;
    }

    return url.toString().replace(/[|<>]/g, encodeURIComponent);
  } catch {
    return null;
  }
}
