import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger, getMockMessage } from "@/__tests__/helpers";
import { withLocalMailSyncBudget } from "@/utils/email/local-mail-sync-budget";
import { parseMessage } from "@/utils/gmail/message";
import {
  captureGmailMailHistoryCursor,
  getGmailMailBackfillPage,
  getGmailMailChangesPage,
  hydrateGmailMailMessages,
} from "./local-mail-sync";

vi.mock("@/utils/gmail/message");
vi.mock("@/utils/redis", () => ({ redis: {} }));
vi.mock("@/utils/email/local-mail-sync-budget", async (original) => ({
  ...(await original<typeof import("@/utils/email/local-mail-sync-budget")>()),
  withLocalMailSyncBudget: vi.fn(),
}));
const logger = createTestLogger();
const after = new Date("2026-01-01T00:00:00.125Z");
const before = new Date("2026-02-01T00:00:00.125Z");
let gmail: ReturnType<typeof makeGmail>;
beforeEach(() => {
  vi.resetAllMocks();
  gmail = makeGmail();
  vi.mocked(withLocalMailSyncBudget).mockImplementation((_input, operation) =>
    operation(new AbortController().signal),
  );
  vi.mocked(parseMessage).mockImplementation((raw) => raw as never);
});
describe("Gmail enumeration checkpoints", () => {
  it("captures history before listing and leaves hydration to independently persisted jobs", async () => {
    gmail.users.messages.list.mockResolvedValueOnce({
      data: { messages: [{ id: "message" }], nextPageToken: "next" },
    });
    const first = await getGmailMailBackfillPage(input());
    expect(gmail.users.getProfile.mock.invocationCallOrder[0]).toBeLessThan(
      gmail.users.messages.list.mock.invocationCallOrder[0]!,
    );
    expect(first.messageIds).toEqual(["message"]);
    expect(gmail.users.messages.get).not.toHaveBeenCalled();
    expect(gmail.users.messages.list).toHaveBeenCalledWith(
      expect.objectContaining({
        q: `after:${Math.floor(after.getTime() / 1000) - 1} before:${Math.ceil(before.getTime() / 1000) + 1} -in:spam -in:trash -in:drafts`,
        includeSpamTrash: false,
      }),
      expect.objectContaining({ retry: false }),
    );
    const second = await getGmailMailBackfillPage({
      ...input(),
      cursor: first.nextCursor,
    });
    expect(second.historyCursor).toBe(first.historyCursor);
    expect(gmail.users.getProfile).toHaveBeenCalledTimes(1);
    expect(gmail.users.messages.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageToken: "next" }),
      expect.anything(),
    );
  });
  it("rejects a repeated backfill continuation before checkpointing it", async () => {
    gmail.users.messages.list.mockResolvedValue({
      data: { messages: [], nextPageToken: "same" },
    });
    const first = await getGmailMailBackfillPage(input());
    await expect(
      getGmailMailBackfillPage({ ...input(), cursor: first.nextCursor }),
    ).rejects.toThrow("did not advance");
  });
  it("rejects a repeated history continuation before checkpointing it", async () => {
    const cursor = await captureGmailMailHistoryCursor(input());
    gmail.users.history.list.mockResolvedValue({
      data: { historyId: "200", nextPageToken: "same" },
    });
    const first = await getGmailMailChangesPage({ ...input(), cursor });
    if (first.resetRequired) throw new Error("Unexpected reset");
    await expect(
      getGmailMailChangesPage({ ...input(), cursor: first.cursor }),
    ).rejects.toThrow("did not advance");
  });
  it("omits the provider lower-bound query for the explicit all-time window", async () => {
    await getGmailMailBackfillPage({
      ...input(),
      after: new Date(-8_640_000_000_000_000),
    });
    const query = gmail.users.messages.list.mock.calls[0]?.[0].q;
    expect(query).not.toContain("after:");
    expect(query).toContain("before:");
    expect(query).toContain("-in:spam -in:trash -in:drafts");
  });
  it.each([
    "after",
    "before",
  ] as const)("rejects different %s bounds before provider access", async (bound) => {
    gmail.users.messages.list.mockResolvedValueOnce({
      data: { messages: [], nextPageToken: "next" },
    });
    const page = await getGmailMailBackfillPage(input());
    gmail.users.messages.list.mockClear();
    await expect(
      getGmailMailBackfillPage({
        ...input(),
        cursor: page.nextCursor,
        [bound]: new Date(input()[bound].getTime() + 1),
      }),
    ).rejects.toThrow("Invalid local mail sync cursor");
    expect(gmail.users.messages.list).not.toHaveBeenCalled();
  });
  it.each([
    { version: 2 },
    { scope: "inbox-only" },
    { provider: "microsoft" },
    { emailAccountId: "another-account" },
    { phase: "backfill" },
  ])("rejects incompatible cursor contracts: %j", async (override) => {
    const cursor = await captureGmailMailHistoryCursor(input());
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString());
    const changed = Buffer.from(
      JSON.stringify({ ...decoded, ...override }),
    ).toString("base64url");
    await expect(
      getGmailMailChangesPage({ ...input(), cursor: changed }),
    ).rejects.toThrow("Invalid local mail sync cursor");
    expect(gmail.users.history.list).not.toHaveBeenCalled();
  });
  it("never reuses fixed window coverage for open-ended freshness", async () => {
    const cursor = await captureGmailMailHistoryCursor(input());
    await expect(
      getGmailMailChangesPage({ ...input(), before: undefined, cursor }),
    ).rejects.toThrow("Invalid local mail sync cursor");
  });
  it("keeps the original history anchor until exhaustion", async () => {
    const cursor = await captureGmailMailHistoryCursor(input());
    gmail.users.history.list
      .mockResolvedValueOnce({
        data: { historyId: "200", nextPageToken: "next" },
      })
      .mockResolvedValueOnce({ data: { historyId: "300" } });
    const first = await getGmailMailChangesPage({ ...input(), cursor });
    if (first.resetRequired) throw new Error("Unexpected reset");
    const second = await getGmailMailChangesPage({
      ...input(),
      cursor: first.cursor,
    });
    expect(gmail.users.history.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ startHistoryId: "100", pageToken: "next" }),
      expect.anything(),
    );
    if (second.resetRequired) throw new Error("Unexpected reset");
    await getGmailMailChangesPage({ ...input(), cursor: second.cursor });
    expect(gmail.users.history.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ startHistoryId: "300", pageToken: undefined }),
      expect.anything(),
    );
  });
  it("does not resurrect deleted IDs also named in a history summary", async () => {
    const cursor = await captureGmailMailHistoryCursor(input());
    gmail.users.history.list.mockResolvedValue({
      data: {
        historyId: "200",
        history: [
          {
            messagesAdded: [{ message: { id: "deleted" } }],
            messagesDeleted: [{ message: { id: "deleted" } }],
          },
        ],
      },
    });
    expect(await getGmailMailChangesPage({ ...input(), cursor })).toMatchObject(
      {
        messageIds: [],
        confirmedDeletedMessageIds: ["deleted"],
        resetRequired: false,
      },
    );
  });
  it("returns an explicit reset without adopting a fresh cursor", async () => {
    const cursor = await captureGmailMailHistoryCursor(input());
    gmail.users.getProfile.mockClear();
    gmail.users.history.list.mockRejectedValue({ status: 404 });
    expect(await getGmailMailChangesPage({ ...input(), cursor })).toEqual({
      resetRequired: true,
    });
    expect(gmail.users.getProfile).not.toHaveBeenCalled();
  });
});
describe("Gmail bounded hydration", () => {
  it("reserves every direct get up front and does not hide transport retries", async () => {
    const ids = Array.from({ length: 25 }, (_, i) => `message-${i}`);
    gmail.users.messages.get.mockImplementation(async ({ id }) => ({
      data: message(id),
    }));
    const page = await hydrateGmailMailMessages({
      ...input(),
      messageIds: ids,
    });
    expect(page.messages).toHaveLength(25);
    expect(withLocalMailSyncBudget).toHaveBeenCalledTimes(1);
    expect(withLocalMailSyncBudget).toHaveBeenCalledWith(
      expect.objectContaining({ cost: 500, priority: "backfill" }),
      expect.any(Function),
    );
    expect(gmail.users.messages.get).toHaveBeenCalledTimes(25);
    expect(gmail.users.messages.get).toHaveBeenCalledWith(
      expect.objectContaining({ format: "full" }),
      expect.objectContaining({
        retry: false,
        signal: expect.any(AbortSignal),
      }),
    );
  });
  it("filters exact half-open bounds and excluded labels", async () => {
    const rows = [
      message("old", after.getTime() - 1),
      message("lower"),
      message("upper-inside", before.getTime() - 1),
      message("upper", before.getTime()),
      ...["SPAM", "TRASH", "DRAFT"].map((label) =>
        message(label, after.getTime(), [label]),
      ),
    ];
    for (const row of rows)
      gmail.users.messages.get.mockResolvedValueOnce({ data: row });
    const page = await hydrateGmailMailMessages({
      ...input(),
      messageIds: rows.map(({ id }) => id),
    });
    expect(page.messages.map(({ id }) => id)).toEqual([
      "lower",
      "upper-inside",
    ]);
    expect(page.removedMessageIds).toEqual([
      "old",
      "upper",
      "SPAM",
      "TRASH",
      "DRAFT",
    ]);
    expect(page.confirmedDeletedMessageIds).toEqual([]);
  });
  it("reports only confirmed 404 as deletion and refuses partial failed chunks", async () => {
    gmail.users.messages.get
      .mockResolvedValueOnce({ data: message("present") })
      .mockRejectedValueOnce({ status: 404 });
    expect(
      await hydrateGmailMailMessages({
        ...input(),
        messageIds: ["present", "gone"],
      }),
    ).toMatchObject({
      messages: [{ id: "present" }],
      confirmedDeletedMessageIds: ["gone"],
    });
    gmail.users.messages.get
      .mockResolvedValueOnce({ data: message("present") })
      .mockRejectedValueOnce({ status: 403 });
    await expect(
      hydrateGmailMailMessages({
        ...input(),
        messageIds: ["present", "denied"],
      }),
    ).rejects.toEqual({ status: 403 });
  });
  it("rejects oversized jobs before provider access", async () => {
    await expect(
      hydrateGmailMailMessages({
        ...input(),
        messageIds: Array.from({ length: 26 }, (_, i) => `id-${i}`),
      }),
    ).rejects.toThrow("at most 25");
    expect(withLocalMailSyncBudget).not.toHaveBeenCalled();
  });
  it("rejects missing payloads or invalid dates rather than claiming complete coverage", async () => {
    gmail.users.messages.get.mockResolvedValueOnce({
      data: { id: "incomplete" },
    });
    await expect(
      hydrateGmailMailMessages({ ...input(), messageIds: ["incomplete"] }),
    ).rejects.toThrow("incomplete sync message");
    gmail.users.messages.get.mockResolvedValueOnce({
      data: { ...message("date"), internalDate: null },
    });
    await expect(
      hydrateGmailMailMessages({ ...input(), messageIds: ["date"] }),
    ).rejects.toThrow("message date");
  });
});
function makeGmail() {
  return {
    users: {
      getProfile: vi.fn().mockResolvedValue({ data: { historyId: "100" } }),
      messages: {
        list: vi.fn().mockResolvedValue({ data: { messages: [] } }),
        get: vi.fn(),
      },
      history: {
        list: vi
          .fn()
          .mockResolvedValue({ data: { historyId: "200", history: [] } }),
      },
    },
  };
}
function input() {
  return {
    gmail: gmail as never,
    emailAccountId: "account-1",
    logger,
    after,
    before,
    limit: 50,
  };
}
function message(
  id: string,
  timestamp = after.getTime(),
  labelIds = ["INBOX"],
) {
  return {
    ...getMockMessage({ id, threadId: `thread-${id}`, labelIds }),
    payload: {},
    internalDate: String(timestamp),
  };
}
