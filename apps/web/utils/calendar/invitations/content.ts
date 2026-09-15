export function normalizeCalendarInvitationContent(content: string) {
  // MIME parsers normalize CRLF and final newlines; Graph downloads preserve them.
  return content.replaceAll("\r\n", "\n").replace(/\n+$/, "");
}
