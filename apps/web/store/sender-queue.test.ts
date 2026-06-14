import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchWithAccount = vi.fn();

vi.mock("@/utils/fetch", () => ({
  fetchWithAccount: (...args: Parameters<typeof mockFetchWithAccount>) =>
    mockFetchWithAccount(...args),
}));

describe("sender queue", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockFetchWithAccount.mockResolvedValue({
      ok: true,
      json: async () => ({ threads: [] }),
    });
  });

  it("fetches every sender thread page before processing", async () => {
    mockFetchWithAccount
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          threads: [{ id: "thread-1" }, { id: "thread-2" }],
          nextPageToken: "page-2",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          threads: [{ id: "thread-3" }],
        }),
      });

    const processThreads = vi.fn().mockResolvedValue(undefined);
    const { createSenderQueue } = await import("./sender-queue");
    const { addToQueue } = createSenderQueue(processThreads);

    await addToQueue({
      sender: "sender@example.com",
      emailAccountId: "account-1",
    });

    expect(mockFetchWithAccount).toHaveBeenNthCalledWith(1, {
      url: "/api/threads/basic?fromEmail=sender%40example.com&limit=100&labelId=INBOX",
      emailAccountId: "account-1",
    });
    expect(mockFetchWithAccount).toHaveBeenNthCalledWith(2, {
      url: "/api/threads/basic?fromEmail=sender%40example.com&limit=100&labelId=INBOX&nextPageToken=page-2",
      emailAccountId: "account-1",
    });
    expect(processThreads).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "account-1",
        threadIds: ["thread-1", "thread-2", "thread-3"],
      }),
    );
  });

  it("keeps same-sender queues scoped to email account", async () => {
    mockFetchWithAccount.mockResolvedValue({
      ok: true,
      json: async () => ({ threads: [{ id: "thread-1" }] }),
    });

    const processThreads = vi.fn().mockResolvedValue(undefined);
    const { createSenderQueue } = await import("./sender-queue");
    const { addToQueue } = createSenderQueue(processThreads);

    await addToQueue({
      sender: "sender@example.com",
      emailAccountId: "account-1",
    });
    await addToQueue({
      sender: "sender@example.com",
      emailAccountId: "account-2",
    });

    expect(processThreads).toHaveBeenCalledTimes(2);
    expect(processThreads).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ emailAccountId: "account-1" }),
    );
    expect(processThreads).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ emailAccountId: "account-2" }),
    );
  });
});
