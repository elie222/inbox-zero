import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  MessagingRoutePurpose,
  MessagingRouteTargetType,
} from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";
import { isActivePremium } from "@/utils/premium";
import { getUserPremium } from "@/utils/user/get";
import { getAssistantCapabilitiesTool } from "./tools/settings/get-assistant-capabilities-tool";
import { updateAssistantSettingsTool } from "./tools/settings/update-assistant-settings-tool";

vi.mock("@/utils/prisma");
vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/utils/premium", () => ({
  isActivePremium: vi.fn(),
}));
vi.mock("@/utils/user/get", () => ({
  getUserPremium: vi.fn(),
}));

const logger = createScopedLogger("chat-settings-tools-test");
const mockGetUserPremium = vi.mocked(getUserPremium);
const mockIsActivePremium = vi.mocked(isActivePremium);
const slackRulesRoute = {
  purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
  targetType: MessagingRouteTargetType.CHANNEL,
  targetId: "C123",
};
const slackScheduledCheckInsRoute = {
  purpose: MessagingRoutePurpose.SCHEDULED_CHECK_INS,
  targetType: MessagingRouteTargetType.CHANNEL,
  targetId: "C456",
};

const baseAccountSnapshot = {
  id: "email-account-1",
  email: "user@example.com",
  timezone: "America/Los_Angeles",
  about: "Keep replies concise.",
  multiRuleSelectionEnabled: false,
  meetingBriefingsEnabled: true,
  meetingBriefingsMinutesBefore: 240,
  meetingBriefsSendEmail: true,
  filingEnabled: false,
  filingPrompt: null,
  writingStyle: "Friendly",
  signature: "Best,\nUser",
  includeReferralSignature: false,
  followUpAwaitingReplyDays: 3,
  followUpNeedsReplyDays: 2,
  followUpAutoDraftEnabled: true,
  digestSchedule: {
    id: "digest-1",
    intervalDays: 1,
    occurrences: 1,
    daysOfWeek: 127,
    timeOfDay: new Date("1970-01-01T09:00:00.000Z"),
    nextOccurrenceAt: new Date("2026-02-21T09:00:00.000Z"),
  },
  rules: [
    {
      name: "Newsletter",
      systemType: "NEWSLETTER",
      enabled: true,
      actions: [{ id: "action-digest-1" }],
    },
    {
      name: "Marketing",
      systemType: "MARKETING",
      enabled: true,
      actions: [],
    },
  ],
  automationJob: {
    id: "automation-job-1",
    enabled: true,
    cronExpression: "0 9 * * 1-5",
    prompt: "Highlight urgent items.",
    nextRunAt: new Date("2026-02-21T09:00:00.000Z"),
    messagingChannelId: "c000000000000000000000000",
    messagingChannel: {
      provider: "SLACK",
      teamName: "Acme",
      routes: [slackRulesRoute, slackScheduledCheckInsRoute],
    },
  },
  messagingChannels: [
    {
      id: "c000000000000000000000000",
      provider: "SLACK",
      teamName: "Acme",
      isConnected: true,
      accessToken: "token-1",
      routes: [slackRulesRoute, slackScheduledCheckInsRoute],
    },
  ],
  knowledge: [
    {
      id: "knowledge-1",
      title: "Reply style",
      content: "Use concise bullet points.",
      updatedAt: new Date("2026-02-20T08:00:00.000Z"),
    },
  ],
};

describe("chat settings tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserPremium.mockResolvedValue({});
    mockIsActivePremium.mockReturnValue(true);
    prisma.automationJob.findUnique.mockResolvedValue(
      baseAccountSnapshot.automationJob,
    );
  });

  it("returns writable and read-only capability metadata", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(baseAccountSnapshot);

    const toolInstance = getAssistantCapabilitiesTool({
      email: "user@example.com",
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await toolInstance.execute({});

    expect(result).toMatchObject({
      snapshotVersion: "2026-02-20",
      account: {
        email: "user@example.com",
        provider: "google",
        timezone: "America/Los_Angeles",
      },
    });

    const multiRuleCapability = result.capabilities.find(
      (capability) =>
        capability.path === "assistant.multiRuleSelection.enabled",
    );

    expect(multiRuleCapability).toMatchObject({
      canRead: true,
      canWrite: true,
      value: false,
    });

    const digestCapability = result.capabilities.find(
      (capability) => capability.path === "assistant.digest",
    );

    expect(digestCapability).toMatchObject({
      canRead: true,
      canWrite: false,
      value: {
        enabled: true,
        schedule: {
          intervalDays: 1,
          occurrences: 1,
          daysOfWeek: 127,
          timeOfDay: "1970-01-01T09:00:00.000Z",
          nextOccurrenceAt: "2026-02-21T09:00:00.000Z",
        },
        includedRules: [
          {
            name: "Newsletter",
            systemType: "NEWSLETTER",
            enabled: true,
          },
        ],
      },
    });
    expect(digestCapability?.reason).toContain("not yet exposed");

    const scheduledCheckInsCapability = result.capabilities.find(
      (capability) => capability.path === "assistant.scheduledCheckIns",
    );
    expect(scheduledCheckInsCapability).toMatchObject({
      canRead: true,
      canWrite: true,
      value: {
        enabled: true,
        cronExpression: "0 9 * * 1-5",
        messagingChannelId: "c000000000000000000000000",
        messagingChannelName: "#C456 (Acme)",
        availableChannels: [
          {
            id: "c000000000000000000000000",
            label: "#C456 (Acme)",
          },
        ],
      },
      writePaths: ["assistant.scheduledCheckIns.config"],
    });

    const draftKnowledgeCapability = result.capabilities.find(
      (capability) => capability.path === "assistant.draftKnowledgeBase",
    );
    expect(draftKnowledgeCapability).toMatchObject({
      canRead: true,
      canWrite: true,
      value: {
        totalItems: 1,
        items: [
          {
            id: "knowledge-1",
            title: "Reply style",
            updatedAt: "2026-02-20T08:00:00.000Z",
          },
        ],
      },
      writePaths: [
        "assistant.draftKnowledgeBase.upsert",
        "assistant.draftKnowledgeBase.delete",
      ],
    });
  });

  it("does not include writablePaths in capabilities output", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(baseAccountSnapshot);

    const toolInstance = getAssistantCapabilitiesTool({
      email: "user@example.com",
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await toolInstance.execute({});

    expect(result).not.toHaveProperty("writablePaths");
  });

  it("does not include personal instructions in writable capabilities", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(baseAccountSnapshot);

    const toolInstance = getAssistantCapabilitiesTool({
      email: "user@example.com",
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await toolInstance.execute({});

    const personalInstructionsCapability = result.capabilities.find(
      (c) => c.path === "assistant.personalInstructions.about",
    );
    expect(personalInstructionsCapability).toBeUndefined();
  });

  it("applies deduped settings updates with last-write-wins semantics", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(baseAccountSnapshot);
    prisma.emailAccount.update.mockResolvedValue({});

    const toolInstance = updateAssistantSettingsTool({
      email: "user@example.com",
      emailAccountId: "email-account-1",
      userId: "user-1",
      logger,
    });

    const result = await toolInstance.execute({
      changes: [
        {
          path: "assistant.multiRuleSelection.enabled",
          value: false,
        },
        {
          path: "assistant.multiRuleSelection.enabled",
          value: true,
        },
        {
          path: "assistant.meetingBriefs.minutesBefore",
          value: 90,
        },
      ],
    });

    expect(prisma.emailAccount.update).toHaveBeenCalledWith({
      where: { id: "email-account-1" },
      data: {
        multiRuleSelectionEnabled: true,
        meetingBriefingsMinutesBefore: 90,
      },
    });
    expect(result).toMatchObject({
      success: true,
    });
    expect(result.appliedChanges).toHaveLength(2);
  });

  it("returns a validation error for invalid updateAssistantSettings payload values", async () => {
    const toolInstance = updateAssistantSettingsTool({
      email: "user@example.com",
      emailAccountId: "email-account-1",
      userId: "user-1",
      logger,
    });

    const result = await toolInstance.execute({
      changes: [
        {
          path: "assistant.meetingBriefs.minutesBefore",
          value: "soon",
        },
      ],
    });

    expect(result).toEqual({
      error: expect.stringContaining("Invalid settings update payload."),
    });
    expect(prisma.emailAccount.update).not.toHaveBeenCalled();
  });

  it("updates scheduled check-ins configuration", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(baseAccountSnapshot);
    mockGetUserPremium.mockResolvedValue(null);
    mockIsActivePremium.mockReturnValue(false);
    prisma.automationJob.update.mockResolvedValue({});

    const toolInstance = updateAssistantSettingsTool({
      email: "user@example.com",
      emailAccountId: "email-account-1",
      userId: "user-1",
      logger,
    });

    const result = await toolInstance.execute({
      changes: [
        {
          path: "assistant.scheduledCheckIns.config",
          value: {
            enabled: false,
          },
        },
      ],
    });

    expect(prisma.automationJob.update).toHaveBeenCalledWith({
      where: { id: "automation-job-1" },
      data: {
        enabled: false,
        cronExpression: "0 9 * * 1-5",
        prompt: "Highlight urgent items.",
        messagingChannelId: "c000000000000000000000000",
      },
    });
    expect(result).toMatchObject({
      success: true,
    });
    expect(mockGetUserPremium).not.toHaveBeenCalled();
  });

  it("blocks scheduled check-ins configuration changes without premium", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(baseAccountSnapshot);
    mockGetUserPremium.mockResolvedValue(null);
    mockIsActivePremium.mockReturnValue(false);

    const toolInstance = updateAssistantSettingsTool({
      email: "user@example.com",
      emailAccountId: "email-account-1",
      userId: "user-1",
      logger,
    });

    const result = await toolInstance.execute({
      changes: [
        {
          path: "assistant.scheduledCheckIns.config",
          value: {
            prompt: "Summarize only unread items.",
          },
        },
      ],
    });

    expect(result).toEqual({
      error: "Premium is required for scheduled check-ins.",
    });
    expect(mockGetUserPremium).toHaveBeenCalledWith({ userId: "user-1" });
    expect(prisma.automationJob.update).not.toHaveBeenCalled();
    expect(prisma.automationJob.create).not.toHaveBeenCalled();
  });

  it("requires explicit messagingChannelId when enabling scheduled check-ins", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      ...baseAccountSnapshot,
      messagingChannels: [
        {
          ...baseAccountSnapshot.messagingChannels[0],
          id: "channel-2",
        },
      ],
    });
    prisma.automationJob.findUnique.mockResolvedValue(null);

    const toolInstance = updateAssistantSettingsTool({
      email: "user@example.com",
      emailAccountId: "email-account-1",
      userId: "user-1",
      logger,
    });

    const result = await toolInstance.execute({
      changes: [
        {
          path: "assistant.scheduledCheckIns.config",
          value: {
            enabled: true,
          },
        },
      ],
    });

    expect(result).toEqual({
      error:
        "Provide a messagingChannelId when enabling scheduled check-ins. Ask the user to choose a destination from availableChannels.",
    });
    expect(prisma.automationJob.create).not.toHaveBeenCalled();
  });

  it("exposes connected channels as scheduled check-in candidates", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      ...baseAccountSnapshot,
      messagingChannels: [
        {
          ...baseAccountSnapshot.messagingChannels[0],
          routes: [slackRulesRoute],
        },
      ],
    });
    prisma.automationJob.findUnique.mockResolvedValue(null);

    const toolInstance = getAssistantCapabilitiesTool({
      email: "user@example.com",
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await toolInstance.execute({});
    const scheduledCheckInsCapability = result.capabilities.find(
      (capability) => capability.path === "assistant.scheduledCheckIns",
    );

    expect(scheduledCheckInsCapability).toMatchObject({
      value: {
        availableChannels: [
          {
            id: "c000000000000000000000000",
            label: "Acme",
          },
        ],
      },
    });
  });

  it("creates a scheduled route directly when enabling scheduled check-ins", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      ...baseAccountSnapshot,
      messagingChannels: [
        {
          ...baseAccountSnapshot.messagingChannels[0],
          routes: [slackRulesRoute],
        },
      ],
    });
    prisma.automationJob.findUnique.mockResolvedValue(null);
    prisma.messagingChannel.findUnique.mockResolvedValue({
      id: "c000000000000000000000000",
      provider: "SLACK",
      isConnected: true,
      accessToken: "token-1",
      providerUserId: "U123",
      teamId: "T123",
      routes: [],
    } as any);
    prisma.automationJob.create.mockResolvedValue({});

    const toolInstance = updateAssistantSettingsTool({
      email: "user@example.com",
      emailAccountId: "email-account-1",
      userId: "user-1",
      logger,
    });

    const result = await toolInstance.execute({
      changes: [
        {
          path: "assistant.scheduledCheckIns.config",
          value: {
            enabled: true,
            messagingChannelId: "c000000000000000000000000",
          },
        },
      ],
    });

    expect(result).toMatchObject({
      success: true,
    });
    expect(prisma.messagingRoute.create).toHaveBeenCalledWith({
      data: {
        messagingChannelId: "c000000000000000000000000",
        purpose: MessagingRoutePurpose.SCHEDULED_CHECK_INS,
        targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
        targetId: "U123",
      },
    });
    expect(prisma.automationJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        enabled: true,
        name: "Scheduled check-ins",
        cronExpression: "0 9,14 * * 1-5",
        prompt: null,
        messagingChannelId: "c000000000000000000000000",
        emailAccountId: "email-account-1",
      }),
    });
  });

  it("allows disabling scheduled check-ins even when current channel is stale", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      ...baseAccountSnapshot,
      messagingChannels: [
        {
          ...baseAccountSnapshot.messagingChannels[0],
          id: "channel-stale",
          isConnected: false,
          accessToken: null,
          routes: [],
        },
      ],
    });
    prisma.automationJob.findUnique.mockResolvedValue({
      ...baseAccountSnapshot.automationJob,
      messagingChannelId: "channel-stale",
      messagingChannel: {
        provider: "SLACK",
        teamName: "Acme",
        routes: [
          {
            purpose: MessagingRoutePurpose.SCHEDULED_CHECK_INS,
            targetType: MessagingRouteTargetType.CHANNEL,
            targetId: "C999",
          },
        ],
      },
    });
    prisma.automationJob.update.mockResolvedValue({});

    const toolInstance = updateAssistantSettingsTool({
      email: "user@example.com",
      emailAccountId: "email-account-1",
      userId: "user-1",
      logger,
    });

    const result = await toolInstance.execute({
      changes: [
        {
          path: "assistant.scheduledCheckIns.config",
          value: {
            enabled: false,
          },
        },
      ],
    });

    expect(result).toMatchObject({
      success: true,
    });
    expect(prisma.automationJob.update).toHaveBeenCalledWith({
      where: { id: "automation-job-1" },
      data: {
        enabled: false,
        cronExpression: "0 9 * * 1-5",
        prompt: "Highlight urgent items.",
        messagingChannelId: "channel-stale",
      },
    });
  });

  it("upserts and deletes draft knowledge base entries", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(baseAccountSnapshot);
    prisma.knowledge.upsert.mockResolvedValue({});
    prisma.knowledge.deleteMany.mockResolvedValue({ count: 1 });

    const toolInstance = updateAssistantSettingsTool({
      email: "user@example.com",
      emailAccountId: "email-account-1",
      userId: "user-1",
      logger,
    });

    await toolInstance.execute({
      changes: [
        {
          path: "assistant.draftKnowledgeBase.upsert",
          value: {
            title: "Reply style",
            content: "Keep responses concise.",
          },
          mode: "append",
        },
        {
          path: "assistant.draftKnowledgeBase.delete",
          value: {
            title: "Reply style",
          },
        },
      ],
    });

    expect(prisma.knowledge.upsert).toHaveBeenCalledWith({
      where: {
        emailAccountId_title: {
          emailAccountId: "email-account-1",
          title: "Reply style",
        },
      },
      create: {
        emailAccountId: "email-account-1",
        title: "Reply style",
        content: "Use concise bullet points.\nKeep responses concise.",
      },
      update: {
        content: "Use concise bullet points.\nKeep responses concise.",
      },
    });
    expect(prisma.knowledge.deleteMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "email-account-1",
        title: "Reply style",
      },
    });
  });

  it("preserves operation order for delete then upsert on knowledge entries", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(baseAccountSnapshot);
    prisma.knowledge.upsert.mockResolvedValue({});
    prisma.knowledge.deleteMany.mockResolvedValue({ count: 1 });

    const toolInstance = updateAssistantSettingsTool({
      email: "user@example.com",
      emailAccountId: "email-account-1",
      userId: "user-1",
      logger,
    });

    await toolInstance.execute({
      changes: [
        {
          path: "assistant.draftKnowledgeBase.delete",
          value: {
            title: "Reply style",
          },
        },
        {
          path: "assistant.draftKnowledgeBase.upsert",
          value: {
            title: "Reply style",
            content: "Recreated entry.",
          },
          mode: "replace",
        },
      ],
    });

    expect(prisma.knowledge.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.knowledge.upsert).toHaveBeenCalledTimes(1);
    expect(
      prisma.knowledge.deleteMany.mock.invocationCallOrder[0],
    ).toBeLessThan(prisma.knowledge.upsert.mock.invocationCallOrder[0]);
    expect(prisma.knowledge.upsert).toHaveBeenCalledWith({
      where: {
        emailAccountId_title: {
          emailAccountId: "email-account-1",
          title: "Reply style",
        },
      },
      create: {
        emailAccountId: "email-account-1",
        title: "Reply style",
        content: "Recreated entry.",
      },
      update: {
        content: "Recreated entry.",
      },
    });
  });

  it("preserves operation order for upsert-delete-upsert sequences", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(baseAccountSnapshot);
    prisma.knowledge.upsert.mockResolvedValue({});
    prisma.knowledge.deleteMany.mockResolvedValue({ count: 1 });

    const toolInstance = updateAssistantSettingsTool({
      email: "user@example.com",
      emailAccountId: "email-account-1",
      userId: "user-1",
      logger,
    });

    await toolInstance.execute({
      changes: [
        {
          path: "assistant.draftKnowledgeBase.upsert",
          value: {
            title: "Reply style",
            content: "First update.",
          },
          mode: "replace",
        },
        {
          path: "assistant.draftKnowledgeBase.delete",
          value: {
            title: "Reply style",
          },
        },
        {
          path: "assistant.draftKnowledgeBase.upsert",
          value: {
            title: "Reply style",
            content: "Final update.",
          },
          mode: "replace",
        },
      ],
    });

    expect(prisma.knowledge.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.knowledge.deleteMany).toHaveBeenCalledTimes(1);

    const [firstUpsertOrder, secondUpsertOrder] =
      prisma.knowledge.upsert.mock.invocationCallOrder;
    const [deleteOrder] = prisma.knowledge.deleteMany.mock.invocationCallOrder;

    expect(firstUpsertOrder).toBeLessThan(deleteOrder);
    expect(deleteOrder).toBeLessThan(secondUpsertOrder);

    expect(prisma.knowledge.upsert.mock.calls[1][0]).toMatchObject({
      create: {
        title: "Reply style",
        content: "Final update.",
      },
      update: {
        content: "Final update.",
      },
    });
  });

  it("returns a validation error for invalid loosely typed payload values", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(baseAccountSnapshot);

    const toolInstance = updateAssistantSettingsTool({
      email: "user@example.com",
      emailAccountId: "email-account-1",
      userId: "user-1",
      logger,
    });

    const result = await toolInstance.execute({
      changes: [
        {
          path: "assistant.meetingBriefs.minutesBefore",
          value: "soon",
        },
      ],
    });

    expect(result).toEqual({
      error: expect.stringContaining("Invalid settings update payload."),
    });
    expect(prisma.emailAccount.update).not.toHaveBeenCalled();
  });

  it("rejects loosely typed changes with null values for non-nullable paths", async () => {
    const toolInstance = updateAssistantSettingsTool({
      email: "user@example.com",
      emailAccountId: "email-account-1",
      userId: "user-1",
      logger,
    });

    const result = await toolInstance.execute({
      changes: [
        {
          path: "assistant.meetingBriefs.enabled",
          value: null,
        },
        {
          path: "assistant.multiRuleSelection.enabled",
          value: true,
        },
      ],
    });

    expect(prisma.emailAccount.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      error: expect.stringContaining("cannot be set to null"),
    });
  });
});
