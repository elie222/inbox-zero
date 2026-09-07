import { mapWithConcurrency } from "@/utils/async";

/**
 * Merges several independently paginated providers into one ordered list.
 *
 * Each source keeps its own page token, so a slow or exhausted source never
 * holds the others back. Rows a page loaded but could not fit under `limit`
 * are remembered as "consumed" instead of being dropped, so the next page
 * re-serves them before advancing that source's token.
 */
export async function mergePaginatedSources<
  TSource extends { id: string },
  TItem,
  TMeta,
>({
  sources,
  cursor,
  limit,
  concurrency,
  compare,
  getItemId,
  dedupeItemKey,
  loadPage,
  onSourceError,
}: {
  sources: TSource[];
  cursor: string | null;
  limit: number;
  concurrency: number;
  /** Orders the merged rows; the first `limit` are returned. */
  compare: (left: TItem, right: TItem) => number;
  /** Identifies a row within its own source, for consumed-row tracking. */
  getItemId: (item: TItem) => string;
  /**
   * Identifies a row across sources, for sources that can return the same one.
   * Rows sharing a key are served once and remembered so a later page cannot
   * repeat them. Leave unset when sources never overlap.
   */
  dedupeItemKey?: (item: TItem) => string;
  loadPage: (input: { source: TSource; pageToken?: string }) => Promise<{
    items: TItem[];
    nextPageToken?: string | null;
    meta?: TMeta;
  }>;
  onSourceError: (input: { source: TSource; error: unknown }) => void;
}) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("limit must be a positive integer");
  }

  const previousCursor = decodeCursor(cursor);
  const sourcesToLoad = sources.filter(
    (source) => !previousCursor.sources[source.id]?.done,
  );

  const sourcePages = await mapWithConcurrency(
    sourcesToLoad,
    concurrency,
    async (source) => {
      const cursorState =
        previousCursor.sources[source.id] ?? INITIAL_SOURCE_CURSOR;
      try {
        const page = await loadPage({
          source,
          pageToken: cursorState.pageToken ?? undefined,
        });
        return { source, cursorState, page };
      } catch (error) {
        onSourceError({ source, error });
        return { source, cursorState, page: null };
      }
    },
  );

  const failedSourceIds: string[] = [];
  const metaBySourceId: Record<string, TMeta> = {};
  // Each source keeps the row's own id, because two sources can identify the
  // same row differently and each needs its own id marked consumed.
  const candidatesByKey = new Map<
    string,
    { item: TItem; itemIdBySource: Map<string, string> }
  >();
  // A key stays here until every source has run past the row, so a row two
  // sources share is served once however far apart their pages are.
  const pendingByEmittedKey = new Map(
    previousCursor.emitted.map((entry) => [entry.key, new Set(entry.pending)]),
  );
  const skippedItemIdsBySource = new Map<string, string[]>();
  const keyFor = (item: TItem, source: TSource) =>
    dedupeItemKey?.(item) ?? `${source.id}:${getItemId(item)}`;

  for (const { source, cursorState, page } of sourcePages) {
    if (!page) {
      failedSourceIds.push(source.id);
      continue;
    }
    if (page.meta !== undefined) metaBySourceId[source.id] = page.meta;

    const consumedIds = new Set(cursorState.consumedIds);
    for (const item of page.items) {
      if (consumedIds.has(getItemId(item))) continue;
      const key = keyFor(item, source);
      const stillPending = pendingByEmittedKey.get(key);
      if (stillPending) {
        // This source has now caught up to a row already served, so consume it
        // here rather than leaving the page looking unfinished forever.
        stillPending.delete(source.id);
        const skipped = skippedItemIdsBySource.get(source.id) ?? [];
        skipped.push(getItemId(item));
        skippedItemIdsBySource.set(source.id, skipped);
        continue;
      }
      const candidate = candidatesByKey.get(key);
      if (candidate) {
        candidate.itemIdBySource.set(source.id, getItemId(item));
        continue;
      }
      candidatesByKey.set(key, {
        item,
        itemIdBySource: new Map([[source.id, getItemId(item)]]),
      });
    }
  }

  const candidates = [...candidatesByKey.values()].sort((left, right) =>
    compare(left.item, right.item),
  );
  const returned = candidates.slice(0, limit);
  const returnedItemIdsBySource = new Map(skippedItemIdsBySource);
  for (const { itemIdBySource } of returned) {
    for (const [sourceId, itemId] of itemIdBySource) {
      const itemIds = returnedItemIdsBySource.get(sourceId) ?? [];
      itemIds.push(itemId);
      returnedItemIdsBySource.set(sourceId, itemIds);
    }
  }

  const pagesBySourceId = new Map(
    sourcePages.map((sourcePage) => [sourcePage.source.id, sourcePage]),
  );
  const nextCursor = emptyCursor();

  for (const source of sources) {
    const sourcePage = pagesBySourceId.get(source.id);
    if (!sourcePage) {
      nextCursor.sources[source.id] =
        previousCursor.sources[source.id] ?? INITIAL_SOURCE_CURSOR;
      continue;
    }
    if (!sourcePage.page) {
      nextCursor.sources[source.id] = sourcePage.cursorState;
      continue;
    }

    const consumedIds = new Set([
      ...sourcePage.cursorState.consumedIds,
      ...(returnedItemIdsBySource.get(source.id) ?? []),
    ]);
    const hasUnconsumedItems = sourcePage.page.items.some(
      (item) => !consumedIds.has(getItemId(item)),
    );
    if (hasUnconsumedItems) {
      nextCursor.sources[source.id] = {
        ...sourcePage.cursorState,
        consumedIds: [...consumedIds],
      };
    } else if (sourcePage.page.nextPageToken) {
      nextCursor.sources[source.id] = {
        pageToken: sourcePage.page.nextPageToken,
        consumedIds: [],
        done: false,
      };
    } else {
      nextCursor.sources[source.id] = DONE_SOURCE_CURSOR;
    }
  }

  if (dedupeItemKey) {
    for (const { item, itemIdBySource } of returned) {
      const key = dedupeItemKey(item);
      if (pendingByEmittedKey.has(key)) continue;
      pendingByEmittedKey.set(
        key,
        new Set(
          sources
            .map((source) => source.id)
            .filter((sourceId) => !itemIdBySource.has(sourceId)),
        ),
      );
    }
    // A source that is finished will never surface the row, so it stops
    // holding the key and the ledger drains instead of growing.
    nextCursor.emitted = [...pendingByEmittedKey]
      .map(([key, pending]) => ({
        key,
        pending: [...pending].filter(
          (sourceId) => nextCursor.sources[sourceId]?.done === false,
        ),
      }))
      .filter((entry) => entry.pending.length > 0);
  }

  return {
    items: returned.map(({ item }) => item),
    metaBySourceId,
    failedSourceIds,
    nextPageToken: Object.values(nextCursor.sources).some(
      (state) => !state.done,
    )
      ? encodeCursor(nextCursor)
      : null,
  };
}

type SourceCursorState = {
  pageToken: string | null;
  consumedIds: string[];
  done: boolean;
};

type MergedCursor = {
  version: 3;
  sources: Record<string, SourceCursorState>;
  /**
   * Rows already served, each with the sources that have yet to reach them, so
   * a row two sources share is served once and then forgotten.
   */
  emitted: EmittedKey[];
};

type EmittedKey = { key: string; pending: string[] };

const INITIAL_SOURCE_CURSOR: SourceCursorState = {
  pageToken: null,
  consumedIds: [],
  done: false,
};
const DONE_SOURCE_CURSOR: SourceCursorState = {
  pageToken: null,
  consumedIds: [],
  done: true,
};

function encodeCursor(cursor: MergedCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(cursor: string | null): MergedCursor {
  if (!cursor) return emptyCursor();

  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (!isRecord(parsed)) return emptyCursor();
    // A page loaded before this shipped still holds a v2 cursor. Reading it
    // keeps "load more" moving forward instead of restarting from page one.
    const rawSources = parsed.version === 3 ? parsed.sources : parsed.accounts;
    if (!isRecord(rawSources)) return emptyCursor();

    const sources = Object.fromEntries(
      Object.entries(rawSources).flatMap((entry) => {
        const state = toSourceCursorState(entry[1]);
        return state ? [[entry[0], state] as const] : [];
      }),
    );
    return {
      version: 3,
      sources,
      emitted: Array.isArray(parsed.emitted)
        ? parsed.emitted.flatMap((entry) =>
            isEmittedKey(entry) ? [entry] : [],
          )
        : [],
    };
  } catch {
    return emptyCursor();
  }
}

function emptyCursor(): MergedCursor {
  return { version: 3, sources: {}, emitted: [] };
}

function toSourceCursorState(value: unknown): SourceCursorState | null {
  if (!isRecord(value)) return null;
  if (typeof value.pageToken !== "string" && value.pageToken !== null) {
    return null;
  }
  if (typeof value.done !== "boolean") return null;
  // v2 named this field consumedThreadIds.
  const consumed = value.consumedIds ?? value.consumedThreadIds;
  if (!Array.isArray(consumed)) return null;

  return {
    pageToken: value.pageToken,
    consumedIds: consumed.filter((id): id is string => typeof id === "string"),
    done: value.done,
  };
}

function isEmittedKey(value: unknown): value is EmittedKey {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    Array.isArray(value.pending) &&
    value.pending.every((sourceId) => typeof sourceId === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
