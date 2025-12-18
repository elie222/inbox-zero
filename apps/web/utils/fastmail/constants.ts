// Cookie name for OAuth state validation
export const FASTMAIL_LINKING_STATE_COOKIE_NAME = "fastmail_linking_state";

// Standard JMAP mailbox roles (RFC 8621)
export const FastmailMailbox = {
  INBOX: "inbox",
  DRAFTS: "drafts",
  SENT: "sent",
  TRASH: "trash",
  JUNK: "junk", // spam
  ARCHIVE: "archive",
  ALL: "all",
  FLAGGED: "flagged", // starred
} as const;

// Map standard roles to display names
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
