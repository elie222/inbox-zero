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
  return markdownToSlackMrkdwn(
    text
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|blockquote|section|article)>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "• ")
      .replace(
        /<a\b[^>]*href=(["'])(.*?)\1[^>]*>(.*?)<\/a>/gis,
        (_match, _quote, href: string, label: string) => {
          const normalizedLabel = label.replace(/<[^>]+>/g, "").trim() || href;
          return `[${normalizedLabel}](${href})`;
        },
      )
      .replace(/<[^>]+>/g, "")
      .trim(),
  );
}
