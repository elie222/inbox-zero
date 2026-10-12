import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import {
  INLINE_ARCHIVE_EXISTING_MESSAGE_LIMIT,
  archiveExistingSenderMail,
} from "./archive-existing";

vi.mock("@/utils/prisma");

const logger = createTestLogger();

function provider() {
  return {
    bulkArchiveSenderOrThrow: vi.fn().mockResolvedValue(0),
  };
}

describe("archiveExistingSenderMail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("archives a small backlog before returning", async () => {
    prisma.emailMessage.count.mockResolvedValue(2 as never);
    const emailProvider = provider();

    await expect(
      archiveExistingSenderMail({
        emailAccountId: "account-1",
        emailProvider: emailProvider as never,
        senderEmail: "news@example.com",
        ownerEmail: "user@example.com",
        logger,
      }),
    ).resolves.toBe("completed");

    expect(emailProvider.bulkArchiveSenderOrThrow).toHaveBeenCalledWith(
      "news@example.com",
      "user@example.com",
      "account-1",
    );
  });

  it("queues when local stats have no inbox rows", async () => {
    prisma.emailMessage.count.mockResolvedValue(0 as never);
    const emailProvider = provider();

    await expect(
      archiveExistingSenderMail({
        emailAccountId: "account-1",
        emailProvider: emailProvider as never,
        senderEmail: "news@example.com",
        ownerEmail: "user@example.com",
        logger,
      }),
    ).resolves.toBe("queued");
    await vi.waitFor(() => {
      expect(emailProvider.bulkArchiveSenderOrThrow).toHaveBeenCalled();
    });
  });

  it("queues a large backlog and keeps a later failure off the request", async () => {
    prisma.emailMessage.count.mockResolvedValue(
      (INLINE_ARCHIVE_EXISTING_MESSAGE_LIMIT + 1) as never,
    );
    const emailProvider = provider();
    emailProvider.bulkArchiveSenderOrThrow.mockRejectedValue(
      new Error("later"),
    );

    await expect(
      archiveExistingSenderMail({
        emailAccountId: "account-1",
        emailProvider: emailProvider as never,
        senderEmail: "news@example.com",
        ownerEmail: "user@example.com",
        logger,
      }),
    ).resolves.toBe("queued");
  });

  it("surfaces a failure while archiving a small backlog", async () => {
    prisma.emailMessage.count.mockResolvedValue(1 as never);
    const emailProvider = provider();
    emailProvider.bulkArchiveSenderOrThrow.mockRejectedValue(
      new Error("later"),
    );

    await expect(
      archiveExistingSenderMail({
        emailAccountId: "account-1",
        emailProvider: emailProvider as never,
        senderEmail: "news@example.com",
        ownerEmail: "user@example.com",
        logger,
      }),
    ).rejects.toThrow("later");
  });
});
