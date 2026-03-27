import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/utils/prisma", () => ({
  default: {
    messagingChannel: {
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
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

    expect(prisma.messagingChannel.updateMany).toHaveBeenCalledWith({
      where: {
        provider: "SLACK",
        teamId: "T123",
      },
      data: {
        isConnected: false,
        accessToken: null,
        refreshToken: null,
        channelId: null,
        channelName: null,
        sendMeetingBriefs: false,
        sendDocumentFilings: false,
      },
    });
  });

  it("removes Chat SDK installation for the team", async () => {
    await handleSlackAppUninstalled({ teamId: "T123", logger });

    const { adapters } = getMessagingChatSdkBot();
    expect(adapters.slack?.deleteInstallation).toHaveBeenCalledWith("T123");
  });
});
