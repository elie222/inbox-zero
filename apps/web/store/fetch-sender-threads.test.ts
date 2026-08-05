import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithAccount } from "@/utils/fetch";
import { EmailProviderRateLimitError } from "@/utils/error";
import { fetchAllSenderThreads } from "@/store/fetch-sender-threads";

vi.mock("@/utils/fetch", () => ({ fetchWithAccount: vi.fn() }));

describe("fetchAllSenderThreads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
