/**
 * Build RFC 5322 compliant email threading headers.
 * References = parent's References + parent's Message-ID
 * https://datatracker.ietf.org/doc/html/rfc5322#appendix-A.2
 */
export function buildThreadingHeaders(options: {
  headerMessageId: string;
  references?: string;
}): { inReplyTo: string; references: string } {
  if (!options.headerMessageId) {
    return { inReplyTo: "", references: "" };
  }

  return {
    inReplyTo: options.headerMessageId,
    references: options.references
      ? `${options.references} ${options.headerMessageId}`.trim()
      : options.headerMessageId,
  };
}
