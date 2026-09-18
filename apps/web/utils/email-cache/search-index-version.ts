/** One version for the whole local search index. A mismatch makes the worker
 *  discard the SQLite layout and makes each account queue its mail to be
 *  indexed again, so bump it whenever the table layout or the content of an
 *  indexed document changes. Fixtures seeding `localMailMessages` must use it,
 *  or the first sync tick re-queues the account and drops the rows they wrote.
 *
 *  This is a leaf module so browser specs and the index worker can read it
 *  without pulling in the cache database and its worker URLs. */
export const SEARCH_INDEX_VERSION = 4;
