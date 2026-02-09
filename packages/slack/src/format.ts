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
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<$2|$1>")
      // Bold: **text** → *text*
      .replace(/\*\*(.+?)\*\*/g, "*$1*")
      // Headings: # text → *text*
      .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
      // Unordered list bullets: * item or - item → • item
      .replace(/^(\s*)[*-]\s+/gm, "$1• ")
  );
}
