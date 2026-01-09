import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { clearFollowUpLabel } from "./cleanup";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";

vi.mock("@/utils/prisma");

vi.mock("./labels", () => ({
  hasFollowUpLabel: vi.fn(),
  removeFollowUpLabel: vi.fn(),
}));

import { hasFollowUpLabel, removeFollowUpLabel } from "./labels";

const mockHasFollowUpLabel = vi.mocked(hasFollowUpLabel);
const mockRemoveFollowUpLabel = vi.mocked(removeFollowUpLabel);

function createMockProvider(): EmailProvider {
  return {} as unknown as EmailProvider;
}

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    trace: vi.fn(),
    with: vi.fn().mockReturnThis(),
  } as unknown as Logger;
}

describe("clearFollowUpLabel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes label and clears tracker when thread has follow-up label", async () => {
    const mockProvider = createMockProvider();
    const mockLogger = createMockLogger();

    mockHasFollowUpLabel.mockResolvedValue(true);
    mockRemoveFollowUpLabel.mockResolvedValue(undefined);
    prisma.threadTracker.updateMany.mockResolvedValue({ count: 1 });

    await clearFollowUpLabel({
      emailAccountId: "account-1",
      threadId: "thread-1",
      provider: mockProvider,
      logger: mockLogger,
    });

    expect(mockHasFollowUpLabel).toHaveBeenCalledWith({
      provider: mockProvider,
      threadId: "thread-1",
    });
    expect(mockRemoveFollowUpLabel).toHaveBeenCalledWith({
      provider: mockProvider,
      threadId: "thread-1",
    });
    expect(prisma.threadTracker.updateMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "account-1",
        threadId: "thread-1",
        resolved: false,
      },
      data: {
        followUpAppliedAt: null,
      },
    });
  });

  it("does nothing when thread does not have follow-up label", async () => {
    const mockProvider = createMockProvider();
    const mockLogger = createMockLogger();

    mockHasFollowUpLabel.mockResolvedValue(false);

    await clearFollowUpLabel({
      emailAccountId: "account-1",
      threadId: "thread-1",
      provider: mockProvider,
      logger: mockLogger,
    });

    expect(mockHasFollowUpLabel).toHaveBeenCalled();
    expect(mockRemoveFollowUpLabel).not.toHaveBeenCalled();
    expect(prisma.threadTracker.updateMany).not.toHaveBeenCalled();
  });

  it("handles error gracefully", async () => {
    const mockProvider = createMockProvider();
    const mockLogger = createMockLogger();

    mockHasFollowUpLabel.mockRejectedValue(new Error("API error"));

    await expect(
      clearFollowUpLabel({
        emailAccountId: "account-1",
        threadId: "thread-1",
        provider: mockProvider,
        logger: mockLogger,
      }),
    ).resolves.not.toThrow();

    expect(mockLogger.error).toHaveBeenCalledWith(
      "Failed to remove follow-up label",
      expect.objectContaining({ threadId: "thread-1" }),
    );
  });
});
