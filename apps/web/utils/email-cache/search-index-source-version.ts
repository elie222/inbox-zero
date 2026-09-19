/** Bumped whenever indexed documents gain a field, so existing accounts rebuild
 *  from local mail rather than answering from a shape that lacks it. Fixtures
 *  seeding `localMailMessages` must use this, or the first sync tick migrates
 *  the account and drops the rows they just wrote.
 *
 *  This is a leaf module so browser specs can read the value without pulling
 *  the cache database and its worker URLs into their bundle. */
export const SOURCE_VERSION = 3;
