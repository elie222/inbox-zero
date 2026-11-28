import { env } from "@/env";

/**
 * Returns the configured "Review Before Delete" label/folder name if enabled.
 *
 * When set, email deletions (trash) and spam classifications do not permanently
 * purge or send messages to system Trash/Spam (which providers auto-delete after 30 days).
 * Instead, they are moved to this label/folder and removed from the Inbox.
 */
export function getReviewBeforeDeleteLabel(): string | undefined {
  const label = env.REVIEW_BEFORE_DELETE_LABEL?.trim();
  return label ? label : undefined;
}

/**
 * Returns true if the Review Before Delete mode is active.
 */
export function isReviewBeforeDeleteEnabled(): boolean {
  return Boolean(getReviewBeforeDeleteLabel());
}

/**
 * System labels that must not be assigned directly via custom label actions
 * to prevent bypassing the Review Before Delete guard.
 */
const RESERVED_BYPASS_LABELS = new Set(["TRASH", "SPAM"]);

export function isReservedReviewBypassLabel(labelName: string): boolean {
  return RESERVED_BYPASS_LABELS.has(labelName.trim().toUpperCase());
}
