import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  AutomationJobRunStatus,
  MessagingProvider,
  MessagingRoutePurpose,
  MessagingRouteTargetType,
} from "@/generated/prisma/enums";
import { createTestLogger } from "@/__tests__/helpers";
import { isActivePremium } from "@/utils/premium";
import { getUserPremium } from "@/utils/user/get";
import { createEmailProvider } from "@/utils/email/provider";
import { getAutomationJobMessage } from "@/utils/automation-jobs/message";
import { sendAutomationMessage } from "@/utils/automation-jobs/messaging";
import { executeAutomationJobRun } from "@/utils/automation-jobs/execute";
import { SafeError } from "@/utils/error";

vi.mock("@/utils/prisma");
vi.mock("@/utils/premium", () => ({
  isActivePremium: vi.fn(),
}));
vi.mock("@/utils/user/get", () => ({
  getUserPremium: vi.fn(),
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(),
}));
vi.mock("@/utils/automation-jobs/message", () => ({
  getAutomationJobMessage: vi.fn(),
}));
vi.mock("@/utils/automation-jobs/messaging", () => ({
  sendAutomationMessage: vi.fn(),
}));

const logger = createTestLogger();
const mockGetUserPremium = vi.mocked(getUserPremium);
const mockIsActivePremium = vi.mocked(isActivePremium);
const mockCreateEmailProvider = vi.mocked(createEmailProvider);
const mockGetAutomationJobMessage = vi.mocked(getAutomationJobMessage);
const mockSendAutomationMessage = vi.mocked(sendAutomationMessage);

describe("executeAutomationJobRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserPremium.mockResolvedValue({});
    mockIsActivePremium.mockReturnValue(true);
    mockCreateEmailProvider.mockResolvedValue({} as any);
    mockGetAutomationJobMessage.mockResolvedValue("Inbox summary");
    mockSendAutomationMessage.mockResolvedValue({
      channelId: "C456",
      messageId: "message-1",
    });
    prisma.automationJobRun.updateMany.mockResolvedValue({ count: 1 });
  });

  it("sends scheduled check-ins to the scheduled check-in route", async () => {
    prisma.automationJobRun.findUnique.mockResolvedValue(
      createRun({
        routes: [createRuleRoute(), createScheduledRoute()],
      }),
    );

    const response = await executeAutomationJobRun({
      automationJobRunId: "run-1",
      logger,
    });

    expect(response.status).toBe(200);
    expect(mockSendAutomationMessage).toHaveBeenCalledWith({
      channel: expect.objectContaining({
        provider: MessagingProvider.SLACK,
      }),
      route: createScheduledRoute(),
      text: "Inbox summary",
      logger: expect.anything(),
    });
    expect(prisma.automationJobRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: expect.objectContaining({
        status: AutomationJobRunStatus.SENT,
        outboundMessage: "Inbox summary",
        providerMessageId: "message-1",
        error: null,
      }),
    });
  });

  it("sends on redelivery after a transient pre-delivery failure", async () => {
    const run = createRun({ routes: [createScheduledRoute()] });
    prisma.automationJobRun.findUnique.mockImplementation(async () => ({
      ...run,
    }));
    prisma.automationJobRun.updateMany.mockImplementation(async () => {
      run.status = AutomationJobRunStatus.RUNNING;
      run.attempts++;
      return { count: 1 };
    });
    prisma.automationJobRun.update.mockImplementation(async ({ data }) => {
      run.status = data.status;
      return run;
    });
    mockGetAutomationJobMessage.mockRejectedValueOnce(
      new Error("Temporary provider error"),
    );

    const first = await executeAutomationJobRun({
      automationJobRunId: run.id,
      logger,
    });
    expect(first.status).toBe(500);
    expect(run.status).toBe(AutomationJobRunStatus.PENDING);
    expect(mockSendAutomationMessage).not.toHaveBeenCalled();

    const retry = await executeAutomationJobRun({
      automationJobRunId: run.id,
      logger,
    });
    expect(retry.status).toBe(200);
    expect(run.status).toBe(AutomationJobRunStatus.SENT);
    expect(mockSendAutomationMessage).toHaveBeenCalledTimes(1);
  });

  it.each([
    "delivery started",
    "retry limit reached",
  ])("keeps the run failed when %s", async (reason) => {
    const run = createRun({ routes: [createScheduledRoute()] });
    if (reason === "delivery started") {
      mockSendAutomationMessage.mockRejectedValueOnce(
        new Error("Delivery timed out"),
      );
    } else {
      run.attempts = 2;
      mockGetAutomationJobMessage.mockRejectedValueOnce(
        new Error("Provider unavailable"),
      );
    }
    prisma.automationJobRun.findUnique.mockResolvedValue(run);

    await executeAutomationJobRun({ automationJobRunId: run.id, logger });

    expect(prisma.automationJobRun.update).toHaveBeenCalledWith({
      where: { id: run.id },
      data: expect.objectContaining({ status: AutomationJobRunStatus.FAILED }),
    });
  });

  it("skips as a configuration error when the scheduled route is missing", async () => {
    prisma.automationJobRun.findUnique.mockResolvedValue(
      createRun({
        routes: [createRuleRoute()],
      }),
    );

    const response = await executeAutomationJobRun({
      automationJobRunId: "run-1",
      logger,
    });

    expect(response.status).toBe(200);
    expect(mockCreateEmailProvider).not.toHaveBeenCalled();
    expect(mockGetAutomationJobMessage).not.toHaveBeenCalled();
    expect(mockSendAutomationMessage).not.toHaveBeenCalled();
    expect(prisma.automationJobRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: expect.objectContaining({
        status: AutomationJobRunStatus.SKIPPED,
        error: "Scheduled check-in destination is not configured",
      }),
    });
  });

  it("skips the run when the email account has been disconnected", async () => {
    prisma.automationJobRun.findUnique.mockResolvedValue(
      createRun({ routes: [createScheduledRoute()] }),
    );
    mockCreateEmailProvider.mockRejectedValue(
      new SafeError("No refresh token"),
    );

    const response = await executeAutomationJobRun({
      automationJobRunId: "run-1",
      logger,
    });

    expect(response.status).toBe(200);
    expect(mockSendAutomationMessage).not.toHaveBeenCalled();
    expect(prisma.automationJobRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: expect.objectContaining({
        status: AutomationJobRunStatus.SKIPPED,
        error: "Email account needs to be reconnected",
      }),
    });
  });
});

function createRun({
  routes,
}: {
  routes: Array<{
    purpose: MessagingRoutePurpose;
    targetType: MessagingRouteTargetType;
    targetId: string;
  }>;
}) {
  return {
    id: "run-1",
    automationJobId: "automation-job-1",
    status: AutomationJobRunStatus.PENDING,
    attempts: 0,
    scheduledFor: new Date(),
    createdAt: new Date(),
    automationJob: {
      id: "automation-job-1",
      emailAccountId: "email-account-1",
      enabled: true,
      prompt: null,
      messagingChannel: {
        id: "channel-1",
        provider: MessagingProvider.SLACK,
        isConnected: true,
        accessToken: "xoxb-token",
        botUserId: "B123",
        providerUserId: "U123",
        routes,
        emailAccount: {
          id: "email-account-1",
          userId: "user-1",
          email: "user@example.com",
          name: "User",
          about: null,
          account: {
            provider: "google",
          },
          user: {
            aiProvider: null,
            aiModel: null,
            aiApiKey: null,
          },
        },
      },
    },
  } as any;
}

function createRuleRoute() {
  return {
    purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
    targetType: MessagingRouteTargetType.CHANNEL,
    targetId: "C123",
  };
}

function createScheduledRoute() {
  return {
    purpose: MessagingRoutePurpose.SCHEDULED_CHECK_INS,
    targetType: MessagingRouteTargetType.CHANNEL,
    targetId: "C456",
  };
}
