import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithAccount } from "@/utils/fetch";
import { EmailProviderRateLimitError } from "@/utils/error";
import { fetchAllSenderThreads } from "@/store/fetch-sender-threads";

vi.mock("@/utils/fetch", () => ({ fetchWithAccount: vi.fn() }));

describe("fetchAllSenderThreads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns exact thread snapshots from every page", async () => {
    const firstPageThreads = [
      { id: "thread-1", messages: [{ id: "message-1" }] },
    ];
    const secondPageThreads = [
      { id: "thread-2", messages: [{ id: "message-2" }] },
    ];
    vi.mocked(fetchWithAccount)
      .mockResolvedValueOnce(
        Response.json({
          threads: firstPageThreads,
          nextPageToken: "page-2",
        }),
      )
      .mockResolvedValueOnce(Response.json({ threads: secondPageThreads }));

    await expect(
      fetchAllSenderThreads({
        sender: "sender@example.com",
        labelId: "INBOX",
        emailAccountId: "account-1",
      }),
    ).resolves.toEqual({
      threads: [...firstPageThreads, ...secondPageThreads],
    });
    expect(fetchWithAccount).toHaveBeenNthCalledWith(1, {
      url: "/api/threads/basic?fromEmail=sender%40example.com&limit=100&labelId=INBOX",
      emailAccountId: "account-1",
    });
    expect(fetchWithAccount).toHaveBeenNthCalledWith(2, {
      url: "/api/threads/basic?fromEmail=sender%40example.com&limit=100&labelId=INBOX&nextPageToken=page-2",
      emailAccountId: "account-1",
    });
  });

  it("surfaces rate-limit responses as a typed error", async () => {
    vi.mocked(fetchWithAccount).mockResolvedValue(
      new Response(null, { status: 429 }),
    );

    await expect(
      fetchAllSenderThreads({
        sender: "sender@example.com",
        emailAccountId: "account-1",
      }),
    ).rejects.toThrow(EmailProviderRateLimitError);
  });

  it("keeps unrelated failures generic", async () => {
    vi.mocked(fetchWithAccount).mockResolvedValue(
      new Response(null, { status: 500 }),
    );

    await expect(
      fetchAllSenderThreads({
        sender: "sender@example.com",
        emailAccountId: "account-1",
      }),
    ).rejects.toThrow("Failed to fetch threads");
  });
});
