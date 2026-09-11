export const MAX_MAIL_SPLITS = 14;

/**
 * One provider query runs per label and each carries its own page token, so a
 * wider split would both fan out and grow the pagination cursor without bound.
 */
export const MAX_SPLIT_LABELS = 5;
