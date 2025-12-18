/**
 * Fastmail constants for OAuth and JMAP mailbox operations.
 * @module fastmail/constants
 */

/**
 * Cookie name used to store OAuth state during the account linking flow.
 * This is used to validate the OAuth callback and prevent CSRF attacks.
 */
export const FASTMAIL_LINKING_STATE_COOKIE_NAME = "fastmail_linking_state";

/**
 * Standard JMAP mailbox roles as defined in RFC 8621.
 * These roles are used to identify system mailboxes regardless of their display name.
 *
 * @see https://www.rfc-editor.org/rfc/rfc8621#section-2
 * @example
 * ```typescript
 * const inbox = await getMailboxByRole(FastmailMailbox.INBOX);
 * ```
 */
export const FastmailMailbox = {
  /** Primary inbox for incoming mail */
  INBOX: "inbox",
  /** Mailbox for draft messages */
  DRAFTS: "drafts",
  /** Mailbox for sent messages */
  SENT: "sent",
  /** Mailbox for deleted messages */
  TRASH: "trash",
  /** Mailbox for spam/junk messages */
  JUNK: "junk",
  /** Mailbox for archived messages */
  ARCHIVE: "archive",
  /** Virtual mailbox containing all messages */
  ALL: "all",
  /** Virtual mailbox containing flagged/starred messages */
  FLAGGED: "flagged",
} as const;

/**
 * Human-readable display names for standard JMAP mailbox roles.
 * Used for UI presentation of mailbox names.
 */
export const MAILBOX_ROLE_DISPLAY_NAMES: Record<string, string> = {
  inbox: "Inbox",
  drafts: "Drafts",
  sent: "Sent",
  trash: "Trash",
  junk: "Spam",
  archive: "Archive",
  all: "All Mail",
  flagged: "Starred",
};
