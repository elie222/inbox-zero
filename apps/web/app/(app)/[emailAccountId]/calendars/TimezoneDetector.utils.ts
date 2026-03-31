export type DismissedPrompt = {
  saved: string;
  detected: string;
  dismissedAt: number; // timestamp
};

export const DISMISSAL_EXPIRY_DAYS = 30;

export function shouldShowTimezonePrompt(
  savedTimezone: string,
  detectedTimezone: string,
  dismissedPrompts: DismissedPrompt[],
): boolean {
  if (savedTimezone === detectedTimezone) {
    return false;
  }

  const now = Date.now();
  const expiryMs = DISMISSAL_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

  const recentlyDismissed = dismissedPrompts.some(
    (prompt) =>
      prompt.saved === savedTimezone &&
      prompt.detected === detectedTimezone &&
      now - prompt.dismissedAt < expiryMs,
  );

  return !recentlyDismissed;
}

export function addDismissedPrompt(
  dismissedPrompts: DismissedPrompt[],
  savedTimezone: string,
  detectedTimezone: string,
): DismissedPrompt[] {
  const filtered = dismissedPrompts.filter(
    (prompt) =>
      !(prompt.saved === savedTimezone && prompt.detected === detectedTimezone),
  );

  return [
    ...filtered,
    {
      saved: savedTimezone,
      detected: detectedTimezone,
      dismissedAt: Date.now(),
    },
  ];
}
