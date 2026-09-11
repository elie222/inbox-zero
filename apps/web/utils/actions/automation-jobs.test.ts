import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  MessagingProvider,
  MessagingRoutePurpose,
  MessagingRouteTargetType,
} from "@/generated/prisma/enums";
import { isActivePremium } from "@/utils/premium";
import { getUserPremium } from "@/utils/user/get";
import { upsertSlackRoute } from "@/utils/messaging/slack-routes";
import {
  saveAutomationJobAction,
  toggleAutomationJobAction,
} from "@/utils/actions/automation-jobs";

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));
vi.mock("@/utils/premium", () => ({
  isActivePremium: vi.fn(),
}));
vi.mock("@/utils/user/get", () => ({
  getUserPremium: vi.fn(),
}));
vi.mock("@/utils/messaging/slack-routes", () => ({
  upsertSlackRoute: vi.fn(),
}));

const mockGetUserPremium = vi.mocked(getUserPremium);
const mockIsActivePremium = vi.mocked(isActivePremium);
const mockUpsertSlackRoute = vi.mocked(upsertSlackRoute);
const CHANNEL_ID = "cmessagingchannel1234567890123";

describe("automation job actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserPremium.mockResolvedValue({});
    mockIsActivePremium.mockReturnValue(true);
    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "user@example.com",
      account: {
        userId: "user-1",
        provider: "google",
      },
    } as any);
  });

  it("creates a scheduled check-in direct route when saving", async () => {
    prisma.messagingChannel.findUnique.mockResolvedValue(
      createSlackChannel({
        routes: [],
      }),
    );
    prisma.automationJob.findUnique.mockResolvedValue({
      id: "automation-job-1",
    } as any);

    const result = await saveAutomationJobAction("email-account-1" as any, {
      cronExpression: "0 9 * * 1-5",
      messagingChannelId: CHANNEL_ID,
      prompt: "Focus on urgent mail.",
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.messagingRoute.create).toHaveBeenCalledWith({
      data: {
        messagingChannelId: CHANNEL_ID,
        purpose: MessagingRoutePurpose.SCHEDULED_CHECK_INS,
        targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
        targetId: "U123",
      },
    });
    expect(prisma.automationJob.update).toHaveBeenCalledWith({
      where: { id: "automation-job-1" },
      data: expect.objectContaining({
        enabled: true,
        name: "Scheduled check-ins",
        cronExpression: "0 9 * * 1-5",
        prompt: "Focus on urgent mail.",
        messagingChannelId: CHANNEL_ID,
      }),
    });
  });

  it("rejects saving when the selected channel is disconnected", async () => {
    prisma.messagingChannel.findUnique.mockResolvedValue(
      createSlackChannel({ isConnected: false, routes: [] }),
    );

    const result = await saveAutomationJobAction("email-account-1" as any, {
      cronExpression: "0 9 * * 1-5",
      messagingChannelId: CHANNEL_ID,
      prompt: null,
    });

    expect(result?.serverError).toBe("Messaging channel is not connected");
    expect(prisma.messagingRoute.create).not.toHaveBeenCalled();
    expect(prisma.automationJob.update).not.toHaveBeenCalled();
    expect(prisma.automationJob.create).not.toHaveBeenCalled();
  });

  it("persists a staged Slack destination only on save", async () => {
    prisma.messagingChannel.findUnique.mockResolvedValue(
      createSlackChannel({
        routes: [],
      }),
    );
    prisma.automationJob.findUnique.mockResolvedValue({
      id: "automation-job-1",
    } as any);

    const result = await saveAutomationJobAction("email-account-1" as any, {
      cronExpression: "0 9 * * 1-5",
      messagingChannelId: CHANNEL_ID,
      scheduledCheckInsTargetId: "C999",
      prompt: null,
    });

    expect(result?.serverError).toBeUndefined();
    expect(mockUpsertSlackRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        messagingChannelId: CHANNEL_ID,
        purpose: MessagingRoutePurpose.SCHEDULED_CHECK_INS,
        targetId: "C999",
      }),
    );
    expect(prisma.messagingRoute.create).not.toHaveBeenCalled();
  });

  it("validates and creates a scheduled route before toggling on", async () => {
    prisma.automationJob.findUnique.mockResolvedValue({
      id: "automation-job-1",
      cronExpression: "0 9 * * 1-5",
      messagingChannelId: CHANNEL_ID,
    } as any);
    prisma.messagingChannel.findUnique.mockResolvedValue(
      createSlackChannel({
        routes: [],
      }),
    );

    const result = await toggleAutomationJobAction("email-account-1" as any, {
      enabled: true,
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.messagingRoute.create).toHaveBeenCalledWith({
      data: {
        messagingChannelId: CHANNEL_ID,
        purpose: MessagingRoutePurpose.SCHEDULED_CHECK_INS,
        targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
        targetId: "U123",
      },
    });
    expect(prisma.automationJob.update).toHaveBeenCalledWith({
      where: { id: "automation-job-1" },
      data: expect.objectContaining({
        enabled: true,
      }),
    });
  });

  it("rejects toggling on when the existing channel is disconnected", async () => {
    prisma.automationJob.findUnique.mockResolvedValue({
      id: "automation-job-1",
      cronExpression: "0 9 * * 1-5",
      messagingChannelId: CHANNEL_ID,
    } as any);
    prisma.messagingChannel.findUnique.mockResolvedValue(
      createSlackChannel({
        isConnected: false,
        routes: [createRuleRoute()],
      }),
    );

    const result = await toggleAutomationJobAction("email-account-1" as any, {
      enabled: true,
    });

    expect(result?.serverError).toBe("Messaging channel is not connected");
    expect(prisma.automationJob.update).not.toHaveBeenCalled();
  });
});

function createSlackChannel({
  isConnected = true,
  routes,
}: {
  isConnected?: boolean;
  routes: Array<ReturnType<typeof createRuleRoute>>;
}) {
  return {
    id: CHANNEL_ID,
    provider: MessagingProvider.SLACK,
    isConnected,
    accessToken: "xoxb-token",
    providerUserId: "U123",
    teamId: "T123",
    routes,
  } as any;
}

function createRuleRoute() {
  return {
    purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
    targetType: MessagingRouteTargetType.CHANNEL,
    targetId: "C123",
  };
}
