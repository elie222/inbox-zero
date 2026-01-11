import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { cleanupStaleDrafts } from "./cleanup";
import { createScopedLogger } from "@/utils/logger";
import { createMockEmailProvider } from "@/__tests__/mocks/email-provider.mock";
import { subDays } from "date-fns/subDays";

vi.mock("@/utils/prisma");

vi.mock("./labels", () => ({
  hasFollowUpLabel: vi.fn(),
}));

import { hasFollowUpLabel } from "./labels";

const mockHasFollowUpLabel = vi.mocked(hasFollowUpLabel);

const logger = createScopedLogger("test");

describe("cleanupStaleDrafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cleans up stale drafts when found", async () => {
    const staleDate = subDays(new Date(), 10);
    const mockProvider = createMockEmailProvider({
      getDrafts: vi.fn().mockResolvedValue([
        { id: "draft-1", threadId: "thread-1" },
        { id: "draft-2", threadId: "thread-2" },
      ]),
      deleteDraft: vi.fn().mockResolvedValue(undefined),
    });

    prisma.threadTracker.findMany.mockResolvedValue([
      { id: "tracker-1", threadId: "thread-1", followUpAppliedAt: staleDate },
    ] as any);

    mockHasFollowUpLabel.mockResolvedValue(true);

    await cleanupStaleDrafts({
      emailAccountId: "account-1",
      provider: mockProvider,
      logger,
    });

    expect(prisma.threadTracker.findMany).toHaveBeenCalled();
    expect(mockProvider.getDrafts).toHaveBeenCalled();
    expect(mockHasFollowUpLabel).toHaveBeenCalledWith({
      provider: mockProvider,
      threadId: "thread-1",
      logger: expect.anything(),
    });
    expect(mockProvider.deleteDraft).toHaveBeenCalledWith("draft-1");
    expect(mockProvider.deleteDraft).not.toHaveBeenCalledWith("draft-2");
  });

  it("skips if thread no longer has follow-up label", async () => {
    const staleDate = subDays(new Date(), 10);
    const mockProvider = createMockEmailProvider({
      getDrafts: vi
        .fn()
        .mockResolvedValue([{ id: "draft-1", threadId: "thread-1" }]),
    });

    prisma.threadTracker.findMany.mockResolvedValue([
      { id: "tracker-1", threadId: "thread-1", followUpAppliedAt: staleDate },
    ] as any);

    mockHasFollowUpLabel.mockResolvedValue(false);

    await cleanupStaleDrafts({
      emailAccountId: "account-1",
      provider: mockProvider,
      logger,
    });

    expect(mockProvider.deleteDraft).not.toHaveBeenCalled();
  });
});
