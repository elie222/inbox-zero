export const OUTLOOK_LINKING_STATE_COOKIE_NAME = "outlook_linking_state";

export const WELL_KNOWN_FOLDERS = {
  inbox: "inbox",
  sentitems: "sentitems",
  drafts: "drafts",
  archive: "archive",
  deleteditems: "deleteditems",
  junkemail: "junkemail",
} as const;

export const OutlookLabel = {
  INBOX: "INBOX",
  SENT: "SENT",
  UNREAD: "UNREAD",
  STARRED: "STARRED",
  IMPORTANT: "IMPORTANT",
  SPAM: "SPAM",
  TRASH: "TRASH",
  DRAFT: "DRAFT",
  ARCHIVE: "ARCHIVE",
} as const;
