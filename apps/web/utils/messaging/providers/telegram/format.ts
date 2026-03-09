export function markdownToTelegramText(text: string): string {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\\\n/g, "\n")
    .split("\n")
    .map(normalizeTelegramLine)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized;
}

function normalizeTelegramLine(line: string): string {
  return (
    line
      // Markdown hard line break marker.
      .replace(/\\$/, "")
      // List markers in model markdown responses.
      .replace(/^(\s*)\\?[*-]\s+/, "$1• ")
      // Heading markers.
      .replace(/^#{1,6}\s+/, "")
      // Markdown links.
      .replace(/\[([^[\]]+)\]\(([^()\s]+)\)/g, "$1: $2")
      // Markdown escapes.
      .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, "$1")
      // Strong/emphasis/code.
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      // Single-character emphasis (after list conversion).
      .replace(/(^|[\s([{>])\*([^*\n]+)\*(?=$|[\s)\]}>.,!?;:])/g, "$1$2")
      .replace(/(^|[\s([{>])_([^_\n]+)_(?=$|[\s)\]}>.,!?;:])/g, "$1$2")
      // Cleanup for partially broken markdown tokens.
      .replace(/\*\*/g, "")
      .replace(/__+/g, "")
  );
}
