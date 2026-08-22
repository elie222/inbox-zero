export const EMAIL_CACHE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
export const EMAIL_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
// Sync snapshots cover 30 days and roll every 7; one extra day prevents cleanup racing a refresh.
export const EMAIL_CACHE_MAILBOX_MAX_AGE_MS = 38 * 24 * 60 * 60 * 1000;
export const EMAIL_CACHE_MAX_VIEWS_PER_ACCOUNT = 50;
export const EMAIL_CACHE_DEFAULT_DETAIL_BUDGET_BYTES = 100 * 1024 * 1024;
export const EMAIL_CACHE_MAX_DETAIL_BUDGET_BYTES = 200 * 1024 * 1024;
