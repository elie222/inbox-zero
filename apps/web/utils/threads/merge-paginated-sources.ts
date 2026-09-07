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
  getItemKey = (item, source) => `${source.id}:${getItemId(item)}`,
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
   * Identifies a row across sources. Rows sharing a key are returned once and
   * marked consumed on every source that produced them. Defaults to keeping
   * sources independent.
   */
  getItemKey?: (item: TItem, source: TSource) => string;
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
  const candidatesByKey = new Map<
    string,
    { item: TItem; sourceIds: Set<string> }
  >();

  for (const { source, cursorState, page } of sourcePages) {
    if (!page) {
      failedSourceIds.push(source.id);
      continue;
    }
    if (page.meta !== undefined) metaBySourceId[source.id] = page.meta;

    const consumedIds = new Set(cursorState.consumedIds);
    for (const item of page.items) {
      if (consumedIds.has(getItemId(item))) continue;
      const key = getItemKey(item, source);
      const candidate = candidatesByKey.get(key);
      if (candidate) {
        candidate.sourceIds.add(source.id);
        continue;
      }
      candidatesByKey.set(key, { item, sourceIds: new Set([source.id]) });
    }
  }

  const candidates = [...candidatesByKey.values()].sort((left, right) =>
    compare(left.item, right.item),
  );
  const returned = candidates.slice(0, limit);
  const returnedItemIdsBySource = new Map<string, string[]>();
  for (const { item, sourceIds } of returned) {
    for (const sourceId of sourceIds) {
      const itemIds = returnedItemIdsBySource.get(sourceId) ?? [];
      itemIds.push(getItemId(item));
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
};

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
    if (
      !isRecord(parsed) ||
      parsed.version !== 3 ||
      !isRecord(parsed.sources)
    ) {
      return emptyCursor();
    }

    const sources = Object.fromEntries(
      Object.entries(parsed.sources).filter(
        (entry): entry is [string, SourceCursorState] =>
          isSourceCursorState(entry[1]),
      ),
    );
    return { version: 3, sources };
  } catch {
    return emptyCursor();
  }
}

function emptyCursor(): MergedCursor {
  return { version: 3, sources: {} };
}

function isSourceCursorState(value: unknown): value is SourceCursorState {
  return (
    isRecord(value) &&
    (typeof value.pageToken === "string" || value.pageToken === null) &&
    Array.isArray(value.consumedIds) &&
    value.consumedIds.every((itemId) => typeof itemId === "string") &&
    typeof value.done === "boolean"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
