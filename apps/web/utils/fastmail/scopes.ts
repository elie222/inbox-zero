/**
 * Fastmail JMAP OAuth scopes for email access
 *
 * These scopes follow the JMAP specification URN format.
 * @see https://www.fastmail.com/dev/ for Fastmail-specific scopes
 * @see https://jmap.io/spec-core.html#capabilities for JMAP capabilities
 */
export const SCOPES = [
  /** Core JMAP scope - required for all JMAP operations */
  "urn:ietf:params:jmap:core",
  /** Mail scope - read and manage mail (Mailbox, Thread, Email, SearchSnippet) */
  "urn:ietf:params:jmap:mail",
  /** Email submission scope - send mail (Identity, EmailSubmission) */
  "urn:ietf:params:jmap:submission",
  /** Vacation response scope - manage vacation auto-reply */
  "urn:ietf:params:jmap:vacationresponse",
];

/**
 * Additional scopes that may be useful in the future:
 * - "https://www.fastmail.com/dev/maskedemail" - Masked Email functionality
 */
