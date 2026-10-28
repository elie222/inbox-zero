import { describe, expect, it, vi } from "vitest";
import { mergePaginatedSources } from "@/utils/threads/merge-paginated-sources";

type Item = { id: string; rank: number };
type Page = { items: Item[]; nextPageToken?: string | null; meta?: string[] };

const sources = [{ id: "a" }, { id: "b" }];

describe("buffered pagination", () => {
  it("reuses unfinished pages across requests and advances only exhausted pages", async () => {
    const pages = new Map<string, Page>();
    const loadPage = vi.fn(async ({ source, pageToken }) => {
      if (pageToken) return { items: [item("last", 0)] };
      return {
        items:
          source.id === "a"
            ? [item("first", 4), item("fourth", 1)]
            : [item("second", 3), item("third", 2)],
        nextPageToken: source.id === "a" ? "a-next" : null,
        meta: [source.id],
      };
    });
    const load = (cursor: string | null) =>
      mergePaginatedSources({
        ...options(loadPage),
        cursor,
        pageBuffer: memoryBuffer(pages),
      });

    const first = await load(null);
    const second = await load(first.nextPageToken);
    expect(first.items.map(({ id }) => id)).toEqual(["first", "second"]);
    expect(second.items.map(({ id }) => id)).toEqual(["third", "fourth"]);
    expect(second.metaBySourceId).toEqual({ a: ["a"], b: ["b"] });
    expect(loadPage).toHaveBeenCalledTimes(2);

    const third = await load(second.nextPageToken);
    expect(third.items.map(({ id }) => id)).toEqual(["last"]);
    expect(third.nextPageToken).toBeNull();
    expect(loadPage).toHaveBeenCalledTimes(3);
    expect(loadPage).toHaveBeenLastCalledWith({
      source: { id: "a" },
      pageToken: "a-next",
    });
  });

  it("keeps buffered rows stable while a refresh fetches newer mail", async () => {
    const pageBuffer = memoryBuffer();
    const loadPage = vi
      .fn()
      .mockResolvedValue({ items: [item("first", 3), item("second", 1)] });
    const config = {
      ...options(loadPage),
      sources: [sources[0]],
      limit: 1,
      pageBuffer,
    };
    const first = await mergePaginatedSources({ ...config, cursor: null });
    loadPage.mockResolvedValue({ items: [item("new", 4), item("first", 3)] });

    const second = await mergePaginatedSources({
      ...config,
      cursor: first.nextPageToken,
    });
    expect(second.items.map(({ id }) => id)).toEqual(["second"]);
    expect(loadPage).toHaveBeenCalledTimes(1);
    const refreshed = await mergePaginatedSources({ ...config, cursor: null });
    expect(refreshed.items.map(({ id }) => id)).toEqual(["new"]);
    expect(loadPage).toHaveBeenCalledTimes(2);
  });

  it("refetches expired buffers without repeating consumed rows", async () => {
    const pages = new Map<string, Page>();
    const loadPage = vi
      .fn()
      .mockResolvedValue({ items: [item("first", 3), item("second", 1)] });
    const config = {
      ...options(loadPage),
      sources: [sources[0]],
      limit: 1,
      pageBuffer: memoryBuffer(pages),
    };
    const first = await mergePaginatedSources({ ...config, cursor: null });
    pages.clear();
    const second = await mergePaginatedSources({
      ...config,
      cursor: first.nextPageToken,
    });
    expect(second.items.map(({ id }) => id)).toEqual(["second"]);
    expect(loadPage).toHaveBeenCalledTimes(2);
  });

  it("deduplicates a thread that a different source returns on a later page", async () => {
    const loadPage = vi.fn(async ({ source, pageToken }) => {
      if (source.id === "a")
        return { items: [item("shared", 3), item("last", 1)] };
      if (pageToken) return { items: [item("shared", 3)] };
      return { items: [item("middle", 2)], nextPageToken: "b-next" };
    });
    const config = {
      ...options(loadPage),
      pageBuffer: memoryBuffer(),
      dedupeItemKey: (row: Item) => row.id,
    };
    const first = await mergePaginatedSources({ ...config, cursor: null });
    const second = await mergePaginatedSources({
      ...config,
      cursor: first.nextPageToken,
    });
    expect(first.items.map(({ id }) => id)).toEqual(["shared", "middle"]);
    expect(second.items.map(({ id }) => id)).toEqual(["last"]);
    expect(second.nextPageToken).toBeNull();
    expect(loadPage).toHaveBeenCalledTimes(3);
  });

  it("does not buffer fully consumed pages", async () => {
    const pageBuffer = memoryBuffer();
    const loadPage = vi.fn().mockResolvedValue({ items: [item("only", 1)] });
    const result = await mergePaginatedSources({
      ...options(loadPage),
      sources: [sources[0]],
      cursor: null,
      pageBuffer,
    });
    expect(result.nextPageToken).toBeNull();
    expect(pageBuffer.write).not.toHaveBeenCalled();
  });

  it("never loads a removed source's buffered rows", async () => {
    const loadPage = vi.fn(async ({ source }) => ({
      items: [item(source.id, source.id === "a" ? 2 : 1)],
    }));
    const pageBuffer = memoryBuffer();
    const config = { ...options(loadPage), limit: 1, pageBuffer };
    const first = await mergePaginatedSources({ ...config, cursor: null });
    const second = await mergePaginatedSources({
      ...config,
      sources: [sources[0]],
      cursor: first.nextPageToken,
    });
    expect(second.items).toEqual([]);
    expect(pageBuffer.read).not.toHaveBeenCalled();
  });
});

function item(id: string, rank: number): Item {
  return { id, rank };
}

function options(
  loadPage: (input: {
    source: { id: string };
    pageToken?: string;
  }) => Promise<Page>,
) {
  return {
    sources,
    limit: 2,
    concurrency: 4,
    loadPage,
    compare: (left: Item, right: Item) => right.rank - left.rank,
    getItemId: (row: Item) => row.id,
    onSourceError: ({ error }: { error: unknown }) => {
      throw error;
    },
  };
}

function memoryBuffer(pages = new Map<string, Page>()) {
  return {
    read: vi.fn(async ({ sourceId, id }: { sourceId: string; id: string }) =>
      structuredClone(pages.get(`${sourceId}:${id}`)),
    ),
    write: vi.fn(
      async ({ sourceId, page }: { sourceId: string; page: Page }) => {
        const id = String(pages.size + 1);
        pages.set(`${sourceId}:${id}`, structuredClone(page));
        return id;
      },
    ),
  };
}
