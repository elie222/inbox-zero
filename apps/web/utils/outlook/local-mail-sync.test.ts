import { beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "@/utils/redis";
import { createTestLogger } from "@/__tests__/helpers";
import {
  getOutlookMailBackfillPage,
  getOutlookMailFolderChangesPage,
  getOutlookMailFoldersPage,
  getOutlookLocalMailMessage,
  resolveOutlookLocalMailFolderIds,
} from "./local-mail-sync";

vi.mock("@/utils/redis", () => ({ redis: { get: vi.fn(), set: vi.fn() } }));
vi.mock("@/utils/email/local-mail-sync-budget", async (original) => ({
  ...(await original<typeof import("@/utils/email/local-mail-sync-budget")>()),
  withLocalMailSyncBudget: (
    _input: unknown,
    operation: (signal: AbortSignal) => Promise<unknown>,
  ) => operation(new AbortController().signal),
}));

const logger = createTestLogger();
const folderId = "archive-folder";
const folderIds = {
  inbox: "inbox-folder",
  archive: folderId,
  drafts: "draft-folder",
  deleteditems: "trash-folder",
  junkemail: "spam-folder",
};
const after = new Date("2026-01-01T00:00:00.125Z");
const before = new Date("2026-02-01T00:00:00.125Z");
let request: ReturnType<typeof makeRequest>;
let api: ReturnType<typeof vi.fn>;
let client: { getClient: () => { api: typeof api } };
beforeEach(() => {
  vi.mocked(redis.get).mockReset().mockResolvedValue(null);
  vi.mocked(redis.set).mockReset().mockResolvedValue("OK");
  request = makeRequest();
  api = vi.fn().mockReturnValue(request);
  client = { getClient: () => ({ api }) };
});

describe("Outlook trusted folder identities", () => {
  it("persists each successful lookup so a paused setup resumes without replay", async () => {
    const cache = new Map<string, { id: string | null }>();
    vi.mocked(redis.get).mockImplementation(
      async (key) => cache.get(key) ?? null,
    );
    vi.mocked(redis.set).mockImplementation(async (key, value) => {
      cache.set(key, value as { id: string });
      return "OK";
    });
    request.get
      .mockResolvedValueOnce({ id: "inbox-id" })
      .mockRejectedValueOnce({ statusCode: 429 });
    await expect(
      resolveOutlookLocalMailFolderIds(input()),
    ).rejects.toMatchObject({ statusCode: 429 });
    api.mockClear();
    request.get.mockImplementation(async () => ({
      id: `${api.mock.calls.at(-1)?.[0].split("/").at(-1)}-id`,
    }));
    const ids = await resolveOutlookLocalMailFolderIds(input());
    expect(ids.inbox).toBe("inbox-id");
    expect(api).not.toHaveBeenCalledWith("/me/mailFolders/inbox");
    expect(ids).toMatchObject({
      drafts: "drafts-id",
      deleteditems: "deleteditems-id",
      junkemail: "junkemail-id",
    });
    expect(request.middlewareOptions).toHaveBeenCalled();
  });
  it("scopes trusted cache entries to the authenticated account", async () => {
    vi.mocked(redis.get).mockImplementation(async (key) => ({
      id: `${key}-folder`,
    }));
    const first = await resolveOutlookLocalMailFolderIds(input());
    const second = await resolveOutlookLocalMailFolderIds({
      ...input(),
      emailAccountId: "account-2",
    });
    expect(first.drafts).not.toBe(second.drafts);
    expect(api).not.toHaveBeenCalled();
  });
  it("pauses rather than bypassing unavailable shared storage", async () => {
    vi.mocked(redis.get).mockRejectedValueOnce(new Error("unavailable"));
    await expect(
      resolveOutlookLocalMailFolderIds(input()),
    ).rejects.toMatchObject({ name: "LocalMailSyncPausedError" });
    expect(api).not.toHaveBeenCalled();
  });
});

describe("Outlook folder metadata delta", () => {
  it("does not enumerate mail when excluded folder identities are unknown", async () => {
    await expect(
      getOutlookMailFolderChangesPage({ ...input(), folderIds: {} }),
    ).rejects.toThrow("excluded folder identities are unavailable");
    expect(api).not.toHaveBeenCalled();
  });

  it("binds continuation to the authenticated account and exact folder", async () => {
    request.get.mockResolvedValue({
      value: [],
      "@odata.nextLink": link("$skiptoken=next"),
    });
    const page = await getOutlookMailFolderChangesPage(input());
    if (page.resetRequired) throw new Error("Unexpected reset");
    api.mockClear();
    await expect(
      getOutlookMailFolderChangesPage({
        ...input(),
        emailAccountId: "another-account",
        cursor: page.cursor,
      }),
    ).rejects.toThrow("Invalid Outlook local mail cursor");
    await expect(
      getOutlookMailFolderChangesPage({
        ...input(),
        folderId: "another-folder",
        cursor: page.cursor,
      }),
    ).rejects.toThrow("Invalid Outlook local mail cursor");
    expect(api).not.toHaveBeenCalled();
  });

  it("preserves provided null fields, normalizes dates, and drops unsolicited body payloads", async () => {
    request.get.mockResolvedValue({
      value: [
        {
          id: "null-date",
          receivedDateTime: null,
          subject: null,
          body: { content: "not metadata" },
        },
        {
          id: "dated",
          receivedDateTime: after.toISOString(),
          hasAttachments: true,
          attachments: [{ contentBytes: "binary" }],
        },
      ],
      "@odata.deltaLink": link("$deltatoken=done"),
    });
    const page = await getOutlookMailFolderChangesPage(input());
    if (page.resetRequired) throw new Error("Unexpected reset");
    expect(page.messages).toEqual([
      {
        id: "null-date",
        receivedDateTime: null,
        subject: null,
        internalDate: null,
      },
      {
        id: "dated",
        receivedDateTime: after.toISOString(),
        internalDate: String(after.getTime()),
        hasAttachments: true,
      },
    ]);
  });

  it("fails closed if Graph omits records or the delta continuation", async () => {
    request.get.mockResolvedValue({
      "@odata.deltaLink": link("$deltatoken=done"),
    });
    await expect(getOutlookMailFolderChangesPage(input())).rejects.toThrow(
      "omitted its records",
    );
    request.get.mockResolvedValue({ value: [] });
    await expect(getOutlookMailFolderChangesPage(input())).rejects.toThrow(
      "cursor",
    );
  });

  it("accepts Graph's quoted folder continuation form with immutable IDs on every page", async () => {
    const nextLink = `https://graph.microsoft.com/v1.0/me/mailFolders('${folderId}')/messages/delta?$skiptoken=next`;
    request.get
      .mockResolvedValueOnce({ value: [], "@odata.nextLink": nextLink })
      .mockResolvedValueOnce({
        value: [],
        "@odata.deltaLink": link("$deltatoken=done"),
      });
    const page = await getOutlookMailFolderChangesPage(input());
    if (page.resetRequired) throw new Error("Unexpected reset");
    await getOutlookMailFolderChangesPage({ ...input(), cursor: page.cursor });
    expect(api).toHaveBeenLastCalledWith(nextLink);
    expect(request.header).toHaveBeenCalledTimes(2);
  });

  it("starts an unfiltered immutable-ID traversal and preserves sparse patches", async () => {
    request.get.mockResolvedValue({
      value: [{ id: "message", isRead: true }],
      "@odata.nextLink": link("$skiptoken=next"),
    });
    const page = await getOutlookMailFolderChangesPage(input());
    expect(request.filter).not.toHaveBeenCalled();
    expect(request.select.mock.calls[0]?.[0].split(",")).not.toContain("body");
    expect(request.header).toHaveBeenCalledWith(
      "Prefer",
      'IdType="ImmutableId", odata.maxpagesize=50',
    );
    expect(page).toMatchObject({
      resetRequired: false,
      messages: [{ id: "message", isRead: true }],
      hasMore: true,
      attachmentMetadataAvailable: false,
    });
    if (page.resetRequired) throw new Error("Unexpected reset");
    expect(page.messages[0]).not.toHaveProperty("subject");
    expect(page.messages[0]).not.toHaveProperty("internalDate");
    request.get.mockResolvedValue({
      value: [],
      "@odata.deltaLink": link("$deltatoken=done"),
    });
    const next = await getOutlookMailFolderChangesPage({
      ...input(),
      cursor: page.cursor,
    });
    expect(api).toHaveBeenLastCalledWith(link("$skiptoken=next"));
    expect(next).toMatchObject({ hasMore: false });
  });

  it("treats removed messages as folder membership changes and exposes conflicting events for reconciliation", async () => {
    request.get.mockResolvedValue({
      value: [
        { id: "moved", "@removed": { reason: "deleted" } },
        { id: "ambiguous", "@removed": {} },
        { id: "ambiguous", isRead: true },
      ],
      "@odata.deltaLink": link("$deltatoken=done"),
    });
    const page = await getOutlookMailFolderChangesPage(input());
    expect(page).toMatchObject({
      removedMessageIds: ["moved", "ambiguous"],
      requiresReconciliationMessageIds: ["ambiguous"],
    });
    expect(page).not.toHaveProperty("confirmedDeletedMessageIds");
  });

  it.each([
    { statusCode: 410 },
    { statusCode: 400, code: "SyncStateNotFound" },
    { statusCode: 400, code: "resyncRequired" },
  ])("requires scoped reconciliation on expired state: %j", async (error) => {
    request.get.mockRejectedValue(error);
    expect(await getOutlookMailFolderChangesPage(input())).toEqual({
      resetRequired: true,
    });
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("propagates throttling without advancing the cursor", async () => {
    const error = { statusCode: 429, headers: { "Retry-After": "60" } };
    request.get.mockRejectedValue(error);
    await expect(getOutlookMailFolderChangesPage(input())).rejects.toBe(error);
  });

  it.each([
    "https://example.com/v1.0/me/mailFolders/archive-folder/messages/delta?$skiptoken=next",
    "https://graph.microsoft.com/v1.0/me/mailFolders/another-folder/messages/delta?$skiptoken=next",
    "https://graph.microsoft.com/v1.0/me/mailFolders/archive-folder/messages/delta?$skiptoken=next&$filter=receivedDateTime%20ge%202026-01-01T00:00:00Z",
    "https://graph.microsoft.com/v1.0/me/mailFolders/archive-folder/messages/delta?$skiptoken=next&$expand=attachments",
  ])("rejects a continuation outside its exact protocol boundary: %s", async (nextLink) => {
    request.get.mockResolvedValue({ value: [], "@odata.nextLink": nextLink });
    await expect(getOutlookMailFolderChangesPage(input())).rejects.toThrow(
      "Invalid Outlook local mail cursor",
    );
  });

  it("rejects a sparse row without message identity", async () => {
    request.get.mockResolvedValue({
      value: [{ isRead: true }],
      "@odata.deltaLink": link("$deltatoken=done"),
    });
    await expect(getOutlookMailFolderChangesPage(input())).rejects.toThrow(
      "message ID",
    );
  });
});

describe("Outlook folder discovery", () => {
  it("paginates root and child discovery, including hidden folder metadata without recursive expansion", async () => {
    request.get.mockResolvedValue({
      value: [
        {
          id: "custom",
          parentFolderId: "root",
          displayName: "Custom",
          childFolderCount: 1,
          isHidden: true,
        },
      ],
      "@odata.nextLink":
        "https://graph.microsoft.com/v1.0/me/mailFolders?$skip=50",
    });
    const page = await getOutlookMailFoldersPage({
      client: client as never,
      logger,
      emailAccountId: "account-1",
      limit: 50,
    });
    expect(page.folders[0]).toMatchObject({
      id: "custom",
      childFolderCount: 1,
      isHidden: true,
    });
    expect(request.query).toHaveBeenCalledWith({
      includeHiddenFolders: "true",
    });
    request.get.mockResolvedValue({ value: [] });
    await getOutlookMailFoldersPage({
      client: client as never,
      logger,
      emailAccountId: "account-1",
      limit: 50,
      cursor: page.nextCursor,
    });
    expect(api).toHaveBeenLastCalledWith(
      "https://graph.microsoft.com/v1.0/me/mailFolders?$skip=50",
    );
    await getOutlookMailFoldersPage({
      client: client as never,
      logger,
      emailAccountId: "account-1",
      limit: 50,
      parentFolderId: "custom",
    });
    expect(api).toHaveBeenLastCalledWith("/me/mailFolders/custom/childFolders");
  });
});

describe("Outlook category identities", () => {
  it("maps body categories to account-scoped IDs using the budgeted provider lookup", async () => {
    request.get
      .mockResolvedValueOnce(
        message("message", after, { categories: ["Project"] }),
      )
      .mockResolvedValueOnce({
        value: [{ id: "category-1", displayName: "Project" }],
      });
    const result = await getOutlookLocalMailMessage({
      ...input(),
      messageId: "message",
    });
    expect(result).toMatchObject({
      message: { labelIds: ["ARCHIVE", "category-1"] },
    });
    expect(api).toHaveBeenCalledWith("/me/outlook/masterCategories");
    expect(redis.set).toHaveBeenCalledWith(
      "local-mail-categories:account-1",
      expect.anything(),
      { ex: 300 },
    );
  });

  it("resumes a paginated catalog before returning a message and reuses its scoped cache", async () => {
    const cache = new Map<string, unknown>();
    vi.mocked(redis.get).mockImplementation(
      async (key) => cache.get(key) ?? null,
    );
    vi.mocked(redis.set).mockImplementation(async (key, value) => {
      cache.set(key, value);
      return "OK";
    });
    const nextLink =
      "https://graph.microsoft.com/v1.0/me/outlook/masterCategories?$skiptoken=next";
    const row = message("message", after, { categories: ["Project"] });
    request.get
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce({
        value: [{ id: "other", displayName: "Other" }],
        "@odata.nextLink": nextLink,
      })
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce({
        value: [{ id: "category-1", displayName: "Project" }],
      })
      .mockResolvedValueOnce(row);
    const lookup = () =>
      getOutlookLocalMailMessage({ ...input(), messageId: "message" });
    await expect(lookup()).rejects.toMatchObject({ retryAfterMs: 1000 });
    await expect(lookup()).resolves.toMatchObject({
      message: { labelIds: ["ARCHIVE", "category-1"] },
    });
    await expect(lookup()).resolves.toMatchObject({
      message: { labelIds: ["ARCHIVE", "category-1"] },
    });
    expect(api.mock.calls.map(([path]) => path)).toEqual([
      "/me/messages/message",
      "/me/outlook/masterCategories",
      "/me/messages/message",
      nextLink,
      "/me/messages/message",
    ]);
    expect(redis.get).toHaveBeenCalledWith("local-mail-categories:account-1");
  });

  it("refreshes a complete cache when newly assigned categories are missing", async () => {
    vi.mocked(redis.get).mockResolvedValue({ entries: [["Other", "other"]] });
    request.get
      .mockResolvedValueOnce(
        message("message", after, { categories: ["Project"] }),
      )
      .mockResolvedValueOnce({
        value: [{ id: "category-1", displayName: "Project" }],
      });
    await expect(
      getOutlookLocalMailMessage({ ...input(), messageId: "message" }),
    ).resolves.toMatchObject({
      message: { labelIds: ["ARCHIVE", "category-1"] },
    });
    expect(api).toHaveBeenCalledWith("/me/outlook/masterCategories");
  });

  it("rejects an untrusted catalog continuation without fetching or caching it", async () => {
    request.get
      .mockResolvedValueOnce(
        message("message", after, { categories: ["Project"] }),
      )
      .mockResolvedValueOnce({
        value: [],
        "@odata.nextLink":
          "https://other.example/me/outlook/masterCategories?$skiptoken=next",
      });
    await expect(
      getOutlookLocalMailMessage({ ...input(), messageId: "message" }),
    ).rejects.toThrow("Invalid Outlook category cursor");
    expect(api).toHaveBeenCalledTimes(2);
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("preserves catalog permission failures instead of reporting body sync complete", async () => {
    const denied = { statusCode: 403, code: "ErrorAccessDenied" };
    request.get
      .mockResolvedValueOnce(
        message("message", after, { categories: ["Project"] }),
      )
      .mockRejectedValueOnce(denied);
    await expect(
      getOutlookLocalMailMessage({ ...input(), messageId: "message" }),
    ).rejects.toBe(denied);
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("exposes mapped delta category IDs separately from raw provider names", async () => {
    request.get
      .mockResolvedValueOnce({
        value: [
          { id: "message", categories: ["Project"] },
          { id: "cleared", categories: [] },
          { id: "sparse", isRead: true },
        ],
        "@odata.deltaLink": link("$deltatoken=next"),
      })
      .mockResolvedValueOnce({
        value: [{ id: "category-1", displayName: "Project" }],
      });
    const result = await getOutlookMailFolderChangesPage(input());
    expect(result).toMatchObject({
      messages: [
        { id: "message", categories: ["Project"], categoryIds: ["category-1"] },
        { id: "cleared", categories: [], categoryIds: [] },
        { id: "sparse", isRead: true },
      ],
    });
    if ("messages" in result)
      expect(result.messages[2]).not.toHaveProperty("categoryIds");
  });

  it("retains unknown category names after a complete catalog and caches the fallback", async () => {
    const cache = new Map<string, unknown>();
    vi.mocked(redis.get).mockImplementation(
      async (key) => cache.get(key) ?? null,
    );
    vi.mocked(redis.set).mockImplementation(async (key, value) => {
      cache.set(key, value);
      return "OK";
    });
    const response = {
      value: [message("message", after, { categories: ["Unknown"] })],
    };
    request.get
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce({ value: [] })
      .mockResolvedValueOnce(response);
    const lookup = () =>
      getOutlookMailBackfillPage({ ...input(), after, before });
    await expect(lookup()).resolves.toMatchObject({
      messages: [{ message: { labelIds: ["ARCHIVE", "Unknown"] } }],
    });
    await expect(lookup()).resolves.toMatchObject({
      messages: [{ message: { labelIds: ["ARCHIVE", "Unknown"] } }],
    });
    expect(
      api.mock.calls.filter(
        ([path]) => path === "/me/outlook/masterCategories",
      ),
    ).toHaveLength(1);
  });
});

describe("Outlook separate body backfill", () => {
  it("fetches the unbounded older tail without a synthetic ancient provider date", async () => {
    const oldDate = new Date("1960-01-01T00:00:00.000Z");
    request.get.mockResolvedValue({ value: [message("old-import", oldDate)] });
    const result = await getOutlookMailBackfillPage({
      ...input(),
      after: new Date(-8_640_000_000_000_000),
      before,
    });
    expect(request.filter).toHaveBeenCalledWith(
      `receivedDateTime lt ${before.toISOString()}`,
    );
    expect(result).toMatchObject({
      messages: [{ message: { id: "old-import" } }],
    });
  });

  it("reports expired paging explicitly and refuses excluded folders without fetching", async () => {
    request.get.mockRejectedValue({ statusCode: 410 });
    expect(
      await getOutlookMailBackfillPage({ ...input(), after, before }),
    ).toEqual({ resetRequired: true });
    api.mockClear();
    await expect(
      getOutlookMailBackfillPage({
        ...input(),
        folderId: folderIds.deleteditems,
        after,
        before,
      }),
    ).rejects.toThrow("outside retained scope");
    expect(api).not.toHaveBeenCalled();
  });

  it("uses a fixed half-open date window and normalizes HTML without claiming attachment metadata", async () => {
    request.get.mockResolvedValue({
      value: [
        message("lower", after),
        message("upper", before),
        message("draft", after, { isDraft: true }),
      ],
    });
    const page = await getOutlookMailBackfillPage({
      ...input(),
      after,
      before,
    });
    expect(api).toHaveBeenCalledWith(`/me/mailFolders/${folderId}/messages`);
    expect(request.filter).toHaveBeenCalledWith(
      `receivedDateTime ge ${after.toISOString()} and receivedDateTime lt ${before.toISOString()}`,
    );
    if (page.resetRequired) throw new Error("Unexpected reset");
    expect(page.messages).toHaveLength(1);
    expect(page.messages[0]).toMatchObject({
      message: {
        id: "lower",
        internalDate: String(after.getTime()),
        textPlain: "Hello",
        textHtml: "<p>Hello</p>",
        labelIds: ["ARCHIVE"],
      },
      hasAttachments: true,
      attachmentMetadataAvailable: false,
    });
    expect(request.expand).not.toHaveBeenCalled();
  });

  it("rejects a body continuation reused for another date range", async () => {
    request.get.mockResolvedValue({
      value: [],
      "@odata.nextLink": `https://graph.microsoft.com/v1.0/me/mailFolders/${folderId}/messages?$skip=50`,
    });
    const page = await getOutlookMailBackfillPage({
      ...input(),
      after,
      before,
    });
    if (page.resetRequired) throw new Error("Unexpected reset");
    api.mockClear();
    await expect(
      getOutlookMailBackfillPage({
        ...input(),
        after: new Date(after.getTime() + 1),
        before,
        cursor: page.nextCursor,
      }),
    ).rejects.toThrow("Invalid Outlook local mail cursor");
    expect(api).not.toHaveBeenCalled();
  });

  it("does not treat missing body fields as fetched empty content", async () => {
    request.get.mockResolvedValue({
      value: [message("missing-body", after, { body: undefined })],
    });
    const page = await getOutlookMailBackfillPage({
      ...input(),
      after,
      before,
    });
    if (page.resetRequired) throw new Error("Unexpected reset");
    expect(page.messages[0]?.message.textPlain).toBeUndefined();
    expect(page.messages[0]?.message.textHtml).toBeUndefined();
  });
});

describe("Outlook move resolution", () => {
  it("resolves an immutable ID to its current folder and reports only explicit 404 as not found", async () => {
    request.get.mockResolvedValue(
      message("moved", after, { parentFolderId: "inbox-folder" }),
    );
    const result = await getOutlookLocalMailMessage({
      ...input(),
      messageId: "moved",
    });
    expect(result).toMatchObject({
      status: "found",
      message: { parentFolderId: "inbox-folder", labelIds: ["INBOX"] },
    });
    expect(api).toHaveBeenCalledWith("/me/messages/moved");
    request.get.mockRejectedValue({ statusCode: 404 });
    expect(
      await getOutlookLocalMailMessage({ ...input(), messageId: "moved" }),
    ).toEqual({ status: "notFound" });
    request.get.mockRejectedValue({ statusCode: 403 });
    await expect(
      getOutlookLocalMailMessage({ ...input(), messageId: "moved" }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  // Backfill drops these, so resolving one by ID must agree or excluded mail
  // comes back through the move path.
  it.each([
    { parentFolderId: "draft-folder" },
    { parentFolderId: "trash-folder" },
    { parentFolderId: "spam-folder" },
    { isDraft: true },
  ])("reports a message outside the retained scope as missing (%o)", async (overrides) => {
    request.get.mockResolvedValue(
      message("moved", after, { parentFolderId: "inbox-folder", ...overrides }),
    );
    expect(
      await getOutlookLocalMailMessage({ ...input(), messageId: "moved" }),
    ).toEqual({ status: "notFound" });
  });
});

function makeRequest() {
  return {
    get: vi.fn(),
    options: vi.fn().mockReturnThis(),
    middlewareOptions: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    orderby: vi.fn().mockReturnThis(),
    query: vi.fn().mockReturnThis(),
    top: vi.fn().mockReturnThis(),
    expand: vi.fn().mockReturnThis(),
  };
}
function input() {
  return {
    client: client as never,
    logger,
    emailAccountId: "account-1",
    folderId,
    folderIds,
    limit: 50,
  };
}
function link(query: string) {
  return `https://graph.microsoft.com/v1.0/me/mailFolders/${folderId}/messages/delta?${query}`;
}
function message(id: string, date: Date, overrides: object = {}) {
  return {
    id,
    conversationId: `thread-${id}`,
    parentFolderId: folderId,
    receivedDateTime: date.toISOString(),
    body: { contentType: "html", content: "<p>Hello</p>" },
    hasAttachments: true,
    isDraft: false,
    ...overrides,
  };
}
