import type { OutlookCategory } from "@microsoft/microsoft-graph-types";
import { describe, expect, it, vi } from "vitest";
import type { OutlookClient } from "@/utils/outlook/client";
import { createTestLogger } from "@/__tests__/helpers";
import {
  createLabel,
  getLabel,
  getOrCreateLabels,
  unarchiveThread,
  untrashThread,
  updateMessageCategories,
} from "./label";

const mockGetFolderIds = vi.fn();

vi.mock("@/utils/outlook/message", () => ({
  getFolderIds: (...args: Parameters<typeof mockGetFolderIds>) =>
    mockGetFolderIds(...args),
}));

describe("createLabel", () => {
  it("sanitizes comma-containing category names before Graph API call", async () => {
    const post = vi.fn().mockResolvedValue({
      id: "cat-1",
      displayName: "Notification property update",
      color: "preset1",
    } satisfies OutlookCategory);
    const api = vi.fn().mockReturnValue({ post });
    const client = createMockOutlookClient(api);

    const created = await createLabel({
      client,
      name: "Notification, property update",
      logger: createTestLogger(),
    });

    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: "Notification property update",
      }),
    );
    expect(created.displayName).toBe("Notification property update");
    expect(client.invalidateCategoryMapCache).toHaveBeenCalledTimes(1);
  });
});

describe("getLabel", () => {
  it("matches existing category names using sanitized normalization", async () => {
    const api = vi.fn().mockReturnValue({
      get: vi.fn().mockResolvedValue({
        value: [
          {
            id: "cat-2",
            displayName: "System Notification Property Update",
          },
        ],
      }),
    });
    const client = createMockOutlookClient(api);

    const label = await getLabel({
      client,
      name: "system notification, property update",
    });

    expect(label?.id).toBe("cat-2");
  });
});

describe("getOrCreateLabels", () => {
  it("rejects raw input names that normalize to the same Outlook key", async () => {
    const api = vi.fn();
    const client = createMockOutlookClient(api);

    await expect(
      getOrCreateLabels({
        client,
        names: ["Finance, Updates", "Finance Updates"],
        logger: createTestLogger(),
      }),
    ).rejects.toThrow("normalize to the same value");

    expect(api).not.toHaveBeenCalled();
  });

  it("throws when multiple existing categories share the same normalized key", async () => {
    const get = vi.fn().mockResolvedValue({
      value: [
        { id: "cat-1", displayName: "Finance-Updates" },
        { id: "cat-2", displayName: "Finance Updates" },
      ] satisfies OutlookCategory[],
    });
    const post = vi.fn();
    const api = vi.fn().mockReturnValue({ get, post });
    const client = createMockOutlookClient(api);

    await expect(
      getOrCreateLabels({
        client,
        names: ["Finance Updates"],
        logger: createTestLogger(),
      }),
    ).rejects.toThrow("Ambiguous Outlook category match");

    expect(post).not.toHaveBeenCalled();
  });
});

describe("unarchiveThread", () => {
  it("moves every archived message back, following paged results", async () => {
    mockGetFolderIds.mockResolvedValue({ archive: "archive-id" });
    const { client, post, filters } = createPagingClient([
      { value: [{ id: "m1" }, { id: "m2" }], next: "https://graph/next" },
      { value: [{ id: "m3" }] },
    ]);

    await unarchiveThread({
      client,
      threadId: "thread-1",
      logger: createTestLogger(),
    });

    // Without following @odata.nextLink, m3 would silently stay archived.
    expect(post).toHaveBeenCalledTimes(3);
    expect(post).toHaveBeenCalledWith({ destinationId: "inbox" });
    expect(filters[0]).toContain("parentFolderId eq 'archive-id'");
  });

  it("refuses to run when the archive folder cannot be resolved", async () => {
    mockGetFolderIds.mockResolvedValue({});
    const { client, post } = createPagingClient([{ value: [] }]);

    await expect(
      unarchiveThread({
        client,
        threadId: "thread-1",
        logger: createTestLogger(),
      }),
    ).rejects.toThrow("Archive folder not found");

    expect(post).not.toHaveBeenCalled();
  });
});

describe("untrashThread", () => {
  it("moves every deleted message back, following paged results", async () => {
    mockGetFolderIds.mockResolvedValue({ deleteditems: "deleted-id" });
    const { client, post, filters } = createPagingClient([
      { value: [{ id: "m1" }, { id: "m2" }], next: "https://graph/next" },
      { value: [{ id: "m3" }] },
    ]);

    await untrashThread({
      client,
      threadId: "thread-1",
      logger: createTestLogger(),
    });

    expect(post).toHaveBeenCalledTimes(3);
    expect(post).toHaveBeenCalledWith({ destinationId: "inbox" });
    // Scoping to Deleted Items is what keeps the thread's sent messages put.
    expect(filters[0]).toContain("parentFolderId eq 'deleted-id'");
  });

  it("refuses to run when the deleted items folder cannot be resolved", async () => {
    mockGetFolderIds.mockResolvedValue({ archive: "archive-id" });
    const { client, post } = createPagingClient([{ value: [] }]);

    await expect(
      untrashThread({
        client,
        threadId: "thread-1",
        logger: createTestLogger(),
      }),
    ).rejects.toThrow("Deleted items folder not found");

    expect(post).not.toHaveBeenCalled();
  });
});

describe("updateMessageCategories", () => {
  it("re-reads categories and retries when Graph rejects a concurrent write", async () => {
    let storedCategories = ["Newsletter"];
    const patch = vi
      .fn()
      .mockImplementationOnce(async () => {
        // Another write landed between our read and our PATCH.
        storedCategories = [...storedCategories, "To Reply"];
        throw Object.assign(new Error("change key mismatch"), {
          statusCode: 412,
          code: "ErrorIrresolvableConflict",
        });
      })
      .mockImplementation(async ({ categories }: { categories: string[] }) => {
        storedCategories = categories;
      });
    const client = createCategoryClient(() => storedCategories, patch);

    const changed = await updateMessageCategories({
      client,
      messageId: "message-1",
      update: (categories) => [...categories, "Marketing"],
      logger: createTestLogger(),
    });

    expect(changed).toBe(true);
    expect(patch).toHaveBeenCalledTimes(2);
    expect(storedCategories).toEqual(["Newsletter", "To Reply", "Marketing"]);
  });

  it("does not write when the categories are unchanged", async () => {
    const patch = vi.fn();
    const client = createCategoryClient(() => ["Newsletter"], patch);

    const changed = await updateMessageCategories({
      client,
      messageId: "message-1",
      update: (categories) => categories.filter((c) => c !== "To Reply"),
      logger: createTestLogger(),
    });

    expect(changed).toBe(false);
    expect(patch).not.toHaveBeenCalled();
  });

  it("does not retry errors other than conflicts", async () => {
    const patch = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("Not found"), { statusCode: 404 }),
      );
    const client = createCategoryClient(() => [], patch);

    await expect(
      updateMessageCategories({
        client,
        messageId: "message-1",
        update: (categories) => [...categories, "Marketing"],
        logger: createTestLogger(),
      }),
    ).rejects.toThrow("Not found");
    expect(patch).toHaveBeenCalledTimes(1);
  });
});

function createCategoryClient(
  getCategories: () => string[],
  patch: ReturnType<typeof vi.fn>,
) {
  const api = vi.fn().mockImplementation(() => {
    const builder = {
      select: () => builder,
      get: async () => ({ categories: getCategories() }),
      patch,
    };
    return builder;
  });
  return createMockOutlookClient(api);
}

function createPagingClient(
  pages: { value: { id: string }[]; next?: string }[],
) {
  const post = vi.fn().mockResolvedValue(undefined);
  const filters: string[] = [];
  let pageIndex = 0;

  const api = vi.fn().mockImplementation((path: string) => {
    if (path.includes("/move")) return { post };

    const builder = {
      filter: (value: string) => {
        filters.push(value);
        return builder;
      },
      select: () => builder,
      top: () => builder,
      get: vi.fn().mockImplementation(() => {
        const page = pages[pageIndex++];
        return Promise.resolve({
          value: page.value,
          ...(page.next ? { "@odata.nextLink": page.next } : {}),
        });
      }),
    };
    return builder;
  });

  return { client: createMockOutlookClient(api), api, post, filters };
}

function createMockOutlookClient(api: ReturnType<typeof vi.fn>) {
  return {
    getClient: vi.fn().mockReturnValue({ api }),
    invalidateCategoryMapCache: vi.fn(),
  } as unknown as OutlookClient & {
    invalidateCategoryMapCache: ReturnType<typeof vi.fn>;
  };
}
