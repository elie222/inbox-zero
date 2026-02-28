import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { ensureSlackTeamInstallation } from "@/utils/messaging/chat-sdk/bot";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");

describe("ensureSlackTeamInstallation", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (globalThis as any).inboxZeroMessagingChatSdk = {
      bot: {
        initialize: vi.fn().mockResolvedValue(undefined),
      },
      adapters: {
        slack: {
          getInstallation: vi.fn().mockResolvedValue(null),
          setInstallation: vi.fn().mockResolvedValue(undefined),
        },
      },
    };
  });

  it("loads the latest connected token when seeding installation", async () => {
    prisma.messagingChannel.findFirst.mockResolvedValue({
      accessToken: "xoxb-latest",
      botUserId: "B123",
      teamName: "Team",
    } as any);

    const logger = {
      warn: vi.fn(),
    } as any;

    await ensureSlackTeamInstallation("T-TEAM", logger);

    expect(prisma.messagingChannel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: {
          updatedAt: "desc",
        },
      }),
    );
  });
});
