import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  MessagingProvider,
  MessagingRoutePurpose,
  MessagingRouteTargetType,
} from "@/generated/prisma/enums";
import { ensureScheduledCheckInsRoute } from "./destination";

vi.mock("@/utils/prisma");

describe("ensureScheduledCheckInsRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves an explicit channel route", async () => {
    const route = await ensureScheduledCheckInsRoute({
      channel: createSlackChannel(),
      routes: [
        {
          purpose: MessagingRoutePurpose.SCHEDULED_CHECK_INS,
          targetType: MessagingRouteTargetType.CHANNEL,
          targetId: "C123",
        },
      ],
    });

    expect(route).toEqual({
      purpose: MessagingRoutePurpose.SCHEDULED_CHECK_INS,
      targetType: MessagingRouteTargetType.CHANNEL,
      targetId: "C123",
    });
    expect(prisma.messagingRoute.update).not.toHaveBeenCalled();
    expect(prisma.messagingRoute.create).not.toHaveBeenCalled();
  });

  it("refreshes a stale direct-message route after re-link", async () => {
    const route = await ensureScheduledCheckInsRoute({
      channel: createSlackChannel({ providerUserId: "U456" }),
      routes: [
        {
          purpose: MessagingRoutePurpose.SCHEDULED_CHECK_INS,
          targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
          targetId: "U123",
        },
      ],
    });

    expect(route).toEqual({
      purpose: MessagingRoutePurpose.SCHEDULED_CHECK_INS,
      targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
      targetId: "U456",
    });
    expect(prisma.messagingRoute.update).toHaveBeenCalledWith({
      where: {
        messagingChannelId_purpose: {
          messagingChannelId: "channel-1",
          purpose: MessagingRoutePurpose.SCHEDULED_CHECK_INS,
        },
      },
      data: {
        targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
        targetId: "U456",
      },
    });
  });

  it("creates a direct-message route when none exists", async () => {
    const route = await ensureScheduledCheckInsRoute({
      channel: createSlackChannel(),
      routes: [],
    });

    expect(route).toEqual({
      purpose: MessagingRoutePurpose.SCHEDULED_CHECK_INS,
      targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
      targetId: "U123",
    });
    expect(prisma.messagingRoute.create).toHaveBeenCalledWith({
      data: {
        messagingChannelId: "channel-1",
        purpose: MessagingRoutePurpose.SCHEDULED_CHECK_INS,
        targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
        targetId: "U123",
      },
    });
  });
});

function createSlackChannel({
  providerUserId = "U123",
}: {
  providerUserId?: string | null;
} = {}) {
  return {
    id: "channel-1",
    provider: MessagingProvider.SLACK,
    isConnected: true,
    accessToken: "xoxb-token",
    teamId: "T123",
    providerUserId,
  };
}
