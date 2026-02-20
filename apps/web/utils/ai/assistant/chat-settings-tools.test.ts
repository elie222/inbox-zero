import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import {
  getAssistantCapabilitiesTool,
  updateAssistantSettingsTool,
} from "./chat-settings-tools";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: vi.fn().mockResolvedValue(undefined),
}));

const logger = createScopedLogger("chat-settings-tools-test");

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
};

describe("chat settings tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns writable and read-only capability metadata", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(
      baseAccountSnapshot as any,
    );

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
  });

  it("applies deduped settings updates with last-write-wins semantics", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(
      baseAccountSnapshot as any,
    );
    prisma.emailAccount.update.mockResolvedValue({} as any);

    const toolInstance = updateAssistantSettingsTool({
      email: "user@example.com",
      emailAccountId: "email-account-1",
      logger,
    });

    const result = await toolInstance.execute({
      dryRun: false,
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
      dryRun: false,
    });
    expect(result.appliedChanges).toHaveLength(2);
  });

  it("returns a dry-run preview without writing and appends about by default", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(
      baseAccountSnapshot as any,
    );

    const toolInstance = updateAssistantSettingsTool({
      email: "user@example.com",
      emailAccountId: "email-account-1",
      logger,
    });

    const result = await toolInstance.execute({
      dryRun: true,
      changes: [
        {
          path: "assistant.personalInstructions.about",
          value: "Use short bullet points.",
        },
      ],
    });

    expect(prisma.emailAccount.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      dryRun: true,
    });
    expect(result.appliedChanges).toEqual([
      {
        path: "assistant.personalInstructions.about",
        previous: "Keep replies concise.",
        next: "Keep replies concise.\nUse short bullet points.",
      },
    ]);
  });

  it("replaces about when mode is replace", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(
      baseAccountSnapshot as any,
    );
    prisma.emailAccount.update.mockResolvedValue({} as any);

    const toolInstance = updateAssistantSettingsTool({
      email: "user@example.com",
      emailAccountId: "email-account-1",
      logger,
    });

    const result = await toolInstance.execute({
      dryRun: false,
      changes: [
        {
          path: "assistant.personalInstructions.about",
          value: "Replace existing instructions.",
          mode: "replace",
        },
      ],
    });

    expect(prisma.emailAccount.update).toHaveBeenCalledWith({
      where: { id: "email-account-1" },
      data: {
        about: "Replace existing instructions.",
      },
    });
    expect(result.appliedChanges).toEqual([
      {
        path: "assistant.personalInstructions.about",
        previous: "Keep replies concise.",
        next: "Replace existing instructions.",
      },
    ]);
  });

  it("returns no-op when all values already match", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(
      baseAccountSnapshot as any,
    );

    const toolInstance = updateAssistantSettingsTool({
      email: "user@example.com",
      emailAccountId: "email-account-1",
      logger,
    });

    const result = await toolInstance.execute({
      dryRun: false,
      changes: [
        {
          path: "assistant.personalInstructions.about",
          value: "Keep replies concise.",
        },
      ],
    });

    expect(prisma.emailAccount.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      message: "No setting changes were needed.",
      appliedChanges: [],
    });
  });
});
