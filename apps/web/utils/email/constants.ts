/**
 * Provider-agnostic email state constants
 * Maps Gmail labels and Outlook folders to common concepts
 */

// Standard email states that work across providers
export enum EmailState {
  INBOX = "INBOX",
  SENT = "SENT",
  UNREAD = "UNREAD",
  STARRED = "STARRED", // Gmail: STARRED, Outlook: Flagged
  IMPORTANT = "IMPORTANT",
  SPAM = "SPAM",
  TRASH = "TRASH",
  DRAFT = "DRAFT",
  ARCHIVE = "ARCHIVE", // Gmail: no INBOX label, Outlook: Archive folder
}

// Category-based filtering (Gmail-specific, Outlook has limited equivalents)
export enum EmailCategory {
  PERSONAL = "PERSONAL",
  SOCIAL = "SOCIAL",
  PROMOTIONS = "PROMOTIONS",
  FORUMS = "FORUMS",
  UPDATES = "UPDATES",
}

// Gmail Label mappings
export const GmailStateMap: Record<EmailState, string> = {
  [EmailState.INBOX]: "INBOX",
  [EmailState.SENT]: "SENT",
  [EmailState.UNREAD]: "UNREAD",
  [EmailState.STARRED]: "STARRED",
  [EmailState.IMPORTANT]: "IMPORTANT",
  [EmailState.SPAM]: "SPAM",
  [EmailState.TRASH]: "TRASH",
  [EmailState.DRAFT]: "DRAFT",
  [EmailState.ARCHIVE]: "ARCHIVE", // Special: means "not INBOX"
};

export const GmailCategoryMap: Record<EmailCategory, string> = {
  [EmailCategory.PERSONAL]: "CATEGORY_PERSONAL",
  [EmailCategory.SOCIAL]: "CATEGORY_SOCIAL",
  [EmailCategory.PROMOTIONS]: "CATEGORY_PROMOTIONS",
  [EmailCategory.FORUMS]: "CATEGORY_FORUMS",
  [EmailCategory.UPDATES]: "CATEGORY_UPDATES",
};

// Outlook Folder mappings
// Note: Outlook uses well-known folder names
// https://learn.microsoft.com/en-us/graph/api/resources/mailfolder
export const OutlookStateMap: Record<EmailState, string> = {
  [EmailState.INBOX]: "inbox",
  [EmailState.SENT]: "sentitems",
  [EmailState.UNREAD]: "UNREAD_FLAG", // Special: Outlook uses message flags, not folders
  [EmailState.STARRED]: "FLAGGED", // Special: Outlook uses "flagged" status
  [EmailState.IMPORTANT]: "IMPORTANT_FLAG", // Special: message flag
  [EmailState.SPAM]: "junkemail",
  [EmailState.TRASH]: "deleteditems",
  [EmailState.DRAFT]: "drafts",
  [EmailState.ARCHIVE]: "archive",
};

// Outlook has "Focused" and "Other" inbox, but not full category support like Gmail
export const OutlookCategoryMap: Record<EmailCategory, string | null> = {
  [EmailCategory.PERSONAL]: null, // No direct equivalent
  [EmailCategory.SOCIAL]: null, // No direct equivalent
  [EmailCategory.PROMOTIONS]: null, // No direct equivalent
  [EmailCategory.FORUMS]: null, // No direct equivalent
  [EmailCategory.UPDATES]: null, // No direct equivalent
};

/**
 * InboxZero custom labels/folders that we create
 * These are used for tracking processed emails, archived emails, etc.
 */
export const INBOX_ZERO_FOLDER_PREFIX = "Inbox Zero";

export enum InboxZeroFolder {
  PROCESSED = "processed",
  ARCHIVED = "archived",
  MARKED_READ = "marked_read",
}

/**
 * Get the full InboxZero folder/label name
 */
export function getInboxZeroFolderName(type: InboxZeroFolder): string {
  return `${INBOX_ZERO_FOLDER_PREFIX}/${type}`;
}
