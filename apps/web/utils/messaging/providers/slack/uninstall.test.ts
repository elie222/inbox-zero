import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/utils/prisma", () => ({
  default: {
    $transaction: vi.fn((operations) => Promise.all(operations)),
    messagingChannel: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: "channel-1" }, { id: "channel-2" }]),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    messagingRoute: {
      deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
    },
  },
}));

vi.mock("@/utils/messaging/chat-sdk/bot", () => ({
  getMessagingChatSdkBot: vi.fn().mockReturnValue({
    bot: { initialize: vi.fn() },
    adapters: {
      slack: {
        deleteInstallation: vi.fn(),
      },
    },
  }),
}));

import { handleSlackAppUninstalled } from "./uninstall";
import prisma from "@/utils/prisma";
import { getMessagingChatSdkBot } from "@/utils/messaging/chat-sdk/bot";
import { createTestLogger } from "@/__tests__/helpers";

describe("handleSlackAppUninstalled", () => {
  const logger = createTestLogger();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks all channels for the team as disconnected and clears tokens", async () => {
    await handleSlackAppUninstalled({ teamId: "T123", logger });

    expect(prisma.messagingChannel.findMany).toHaveBeenCalledWith({
      where: {
        provider: "SLACK",
        teamId: "T123",
      },
      select: { id: true },
    });

    expect(prisma.messagingChannel.updateMany).toHaveBeenCalledWith({
      where: {
        provider: "SLACK",
        teamId: "T123",
      },
      data: {
        isConnected: false,
        accessToken: null,
        refreshToken: null,
      },
    });

    expect(prisma.messagingRoute.deleteMany).toHaveBeenCalledWith({
      where: {
        messagingChannelId: { in: ["channel-1", "channel-2"] },
      },
    });
  });

  it("removes Chat SDK installation for the team", async () => {
    await handleSlackAppUninstalled({ teamId: "T123", logger });

    const { adapters } = getMessagingChatSdkBot();
    expect(adapters.slack?.deleteInstallation).toHaveBeenCalledWith("T123");
  });
});
