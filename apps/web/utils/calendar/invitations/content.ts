export function normalizeCalendarInvitationContent(content: string) {
  // MIME parsers normalize CRLF and final newlines; Graph downloads preserve them.
  const normalized = content.replaceAll("\r\n", "\n");
  let end = normalized.length;
  while (normalized[end - 1] === "\n") end--;
  return normalized.slice(0, end);
}
