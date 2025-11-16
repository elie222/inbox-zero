/**
 * Gmail Label Validation
 *
 * This module provides validation for Gmail label names to prevent errors
 * when creating labels via the Gmail API.
 *
 * Sources:
 * - https://developers.google.com/workspace/gmail/api/guides/labels
 * - Observed errors in production (e.g., VOICEMAIL)
 * - Code analysis (e.g., CHAT labels filtered in report.ts)
 */

/**
 * Gmail Reserved System Labels
 *
 * These are Gmail's built-in system labels that CANNOT be used as custom label names.
 * Attempting to create a label with any of these names will result in an "Invalid label name" error.
 *
 * Note: Gmail documentation states this list is "not exhaustive" - there may be additional
 * reserved labels not documented here.
 */
const GMAIL_RESERVED_LABELS = [
  // Standard System Labels (Documented)
  "INBOX",
  "SPAM",
  "TRASH",
  "UNREAD",
  "STARRED",
  "IMPORTANT",
  "SENT",
  "DRAFT",
  "ALL_MAIL",
  "ALLMAIL",

  // Category Labels
  "PERSONAL",
  "SOCIAL",
  "PROMOTIONS",
  "UPDATES",
  "FORUMS",

  // Additional Reserved Labels (Undocumented but Reserved)
  "TRAVEL",
  "FINANCE",
  "CHAT",
  "VOICEMAIL",
  "SCHEDULED",
  "MUTED",
] as const;

/**
 * Invalid characters that cannot be used in Gmail label names
 *
 * Note: Forward slash (/) is NOT included here because it's used to create
 * nested labels (e.g., "Inbox Zero/Archived")
 */
const GMAIL_LABEL_INVALID_CHARS = [
  "\\", // Backslash
  "*", // Asterisk
  "+", // Plus sign
  "`", // Backtick
] as const;

/**
 * Maximum length for a Gmail label name
 */
const GMAIL_LABEL_MAX_LENGTH = 225;

/**
 * Result of label validation
 */
type LabelValidationResult = {
  valid: boolean;
  error?: string;
};

/**
 * Validates basic label name requirements
 *
 * @param name - The label name to validate
 * @returns An object with `valid` boolean and optional `error` message
 */
export function validateLabelNameBasic(name: string): LabelValidationResult {
  // Check if empty
  if (!name || !name.trim()) {
    return { valid: false, error: "Label name cannot be empty" };
  }

  const trimmedName = name.trim();

  if (trimmedName.length > GMAIL_LABEL_MAX_LENGTH) {
    return {
      valid: false,
      error: `Label name cannot exceed ${GMAIL_LABEL_MAX_LENGTH} characters`,
    };
  }

  // Check for leading/trailing spaces
  if (name !== trimmedName) {
    return {
      valid: false,
      error: "Label name cannot have leading or trailing spaces",
    };
  }

  // Check for double spaces
  if (name.includes("  ")) {
    return { valid: false, error: "Label name cannot contain double spaces" };
  }

  // Check for invalid characters
  for (const char of GMAIL_LABEL_INVALID_CHARS) {
    if (name.includes(char)) {
      return {
        valid: false,
        error: `Label name cannot contain the character: ${char}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Validates a Gmail label name (Gmail-specific validation)
 * Includes checks for reserved system labels in addition to basic validation
 *
 * @param name - The label name to validate
 * @returns An object with `valid` boolean and optional `error` message
 *
 * @example
 * ```ts
 * const result = validateGmailLabelName("Work");
 * if (!result.valid) {
 *   console.error(result.error);
 * }
 * ```
 */
export function validateGmailLabelName(name: string): LabelValidationResult {
  // First check basic validation
  const basicValidation = validateLabelNameBasic(name);
  if (!basicValidation.valid) {
    return basicValidation;
  }

  // Check for reserved system labels (case-insensitive)
  const upperName = name.toUpperCase();
  if (GMAIL_RESERVED_LABELS.some((reserved) => upperName === reserved)) {
    return {
      valid: false,
      error: `"${name}" is a reserved Gmail system label and cannot be used`,
    };
  }

  return { valid: true };
}
