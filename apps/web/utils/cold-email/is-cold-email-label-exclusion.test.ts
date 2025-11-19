import { describe, it, expect, vi, beforeEach } from "vitest";
import { isColdEmail } from "./is-cold-email";
import { getEmailAccount } from "@/__tests__/helpers";
import type { EmailForLLM } from "@/utils/types";
import { ColdEmailStatus, ActionType } from "@prisma/client";
import prisma from "@/utils/prisma";
import type { ColdEmailRule } from "./cold-email-rule";

vi.mock("server-only", () => ({}));

vi.mock("@/utils/prisma", () => ({
  default: {
    coldEmail: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/utils/llms", () => ({
  createGenerateObject: vi.fn(() =>
    vi.fn().mockResolvedValue({
      object: {
        coldEmail: false,
        reason: "This is not a cold email",
      },
    }),
  ),
}));

describe("isColdEmail - label exclusion in previous email check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should pass cold email label to provider when checking previous communications", async () => {
    const emailAccount = getEmailAccount({ id: "test-account-id" });
    const mockProvider = {
      hasPreviousCommunicationsWithSenderOrDomain: vi
        .fn()
        .mockResolvedValue(false),
    };

    const coldEmailRule: ColdEmailRule = {
      id: "rule-id",
      enabled: true,
      instructions: "Test instructions",
      actions: [
        {
          type: ActionType.LABEL,
          label: "Cold Email",
          labelId: "label-123",
        },
      ],
    };

    // Mock that sender is not a known cold emailer
    vi.mocked(prisma.coldEmail.findUnique).mockResolvedValue(null);

    const email: EmailForLLM = {
      id: "msg1",
      from: "sender@example.com",
      to: emailAccount.email,
      subject: "Test",
      content: "Test content",
      date: new Date(),
    };

    await isColdEmail({
      email,
      emailAccount,
      provider: mockProvider as never,
      coldEmailRule,
    });

    // Verify that the provider was called with the excludeLabel parameter
    expect(
      mockProvider.hasPreviousCommunicationsWithSenderOrDomain,
    ).toHaveBeenCalledWith({
      from: "sender@example.com",
      date: email.date,
      messageId: "msg1",
      excludeLabel: "Cold Email",
      excludeFolder: null,
    });
  });

  it("should use custom label name when configured", async () => {
    const emailAccount = getEmailAccount({ id: "test-account-id" });
    const mockProvider = {
      hasPreviousCommunicationsWithSenderOrDomain: vi
        .fn()
        .mockResolvedValue(false),
    };

    const coldEmailRule: ColdEmailRule = {
      id: "rule-id",
      enabled: true,
      instructions: "Test instructions",
      actions: [
        {
          type: ActionType.LABEL,
          label: "My Custom Cold Email Label",
          labelId: "label-456",
        },
      ],
    };

    vi.mocked(prisma.coldEmail.findUnique).mockResolvedValue(null);

    const email: EmailForLLM = {
      id: "msg1",
      from: "sender@example.com",
      to: emailAccount.email,
      subject: "Test",
      content: "Test content",
      date: new Date(),
    };

    await isColdEmail({
      email,
      emailAccount,
      provider: mockProvider as never,
      coldEmailRule,
    });

    // Verify that the custom label name is used
    expect(
      mockProvider.hasPreviousCommunicationsWithSenderOrDomain,
    ).toHaveBeenCalledWith({
      from: "sender@example.com",
      date: email.date,
      messageId: "msg1",
      excludeLabel: "My Custom Cold Email Label",
      excludeFolder: null,
    });
  });

  it("should fallback to 'Cold Email' when no label is configured", async () => {
    const emailAccount = getEmailAccount({ id: "test-account-id" });
    const mockProvider = {
      hasPreviousCommunicationsWithSenderOrDomain: vi
        .fn()
        .mockResolvedValue(false),
    };

    const coldEmailRule: ColdEmailRule = {
      id: "rule-id",
      enabled: true,
      instructions: "Test instructions",
      actions: [],
    };

    vi.mocked(prisma.coldEmail.findUnique).mockResolvedValue(null);

    const email: EmailForLLM = {
      id: "msg1",
      from: "sender@example.com",
      to: emailAccount.email,
      subject: "Test",
      content: "Test content",
      date: new Date(),
    };

    await isColdEmail({
      email,
      emailAccount,
      provider: mockProvider as never,
      coldEmailRule,
    });

    // Verify that default label is used when no actions are configured
    expect(
      mockProvider.hasPreviousCommunicationsWithSenderOrDomain,
    ).toHaveBeenCalledWith({
      from: "sender@example.com",
      date: email.date,
      messageId: "msg1",
      excludeLabel: "Cold Email",
      excludeFolder: null,
    });
  });

  it("should fallback to 'Cold Email' when coldEmailRule is null", async () => {
    const emailAccount = getEmailAccount({ id: "test-account-id" });
    const mockProvider = {
      hasPreviousCommunicationsWithSenderOrDomain: vi
        .fn()
        .mockResolvedValue(false),
    };

    vi.mocked(prisma.coldEmail.findUnique).mockResolvedValue(null);

    const email: EmailForLLM = {
      id: "msg1",
      from: "sender@example.com",
      to: emailAccount.email,
      subject: "Test",
      content: "Test content",
      date: new Date(),
    };

    await isColdEmail({
      email,
      emailAccount,
      provider: mockProvider as never,
      coldEmailRule: null,
    });

    // Verify that default label is used when coldEmailRule is null
    expect(
      mockProvider.hasPreviousCommunicationsWithSenderOrDomain,
    ).toHaveBeenCalledWith({
      from: "sender@example.com",
      date: email.date,
      messageId: "msg1",
      excludeLabel: "Cold Email",
      excludeFolder: null,
    });
  });

  it("should return false when hasPreviousEmail is true (excluding cold email label)", async () => {
    const emailAccount = getEmailAccount({ id: "test-account-id" });
    const mockProvider = {
      hasPreviousCommunicationsWithSenderOrDomain: vi
        .fn()
        .mockResolvedValue(true), // Has previous non-cold email
    };

    const coldEmailRule: ColdEmailRule = {
      id: "rule-id",
      enabled: true,
      instructions: "Test instructions",
      actions: [
        {
          type: ActionType.LABEL,
          label: "Cold Email",
          labelId: "label-123",
        },
      ],
    };

    vi.mocked(prisma.coldEmail.findUnique).mockResolvedValue(null);

    const email: EmailForLLM = {
      id: "msg1",
      from: "sender@example.com",
      to: emailAccount.email,
      subject: "Test",
      content: "Test content",
      date: new Date(),
    };

    const result = await isColdEmail({
      email,
      emailAccount,
      provider: mockProvider as never,
      coldEmailRule,
    });

    // Should not be marked as cold email because we have previous communication
    // (excluding emails with the cold email label)
    expect(result.isColdEmail).toBe(false);
    expect(result.reason).toBe("hasPreviousEmail");
  });

  it("should not call provider if sender is already known cold emailer", async () => {
    const emailAccount = getEmailAccount({ id: "test-account-id" });
    const mockProvider = {
      hasPreviousCommunicationsWithSenderOrDomain: vi.fn(),
    };

    const coldEmailRule: ColdEmailRule = {
      id: "rule-id",
      enabled: true,
      instructions: "Test instructions",
      actions: [
        {
          type: ActionType.LABEL,
          label: "Cold Email",
          labelId: "label-123",
        },
      ],
    };

    // Mock that sender is a known cold emailer
    vi.mocked(prisma.coldEmail.findUnique).mockResolvedValue({
      id: "cold-email-id",
      emailAccountId: emailAccount.id,
      fromEmail: "sender@example.com",
      status: ColdEmailStatus.AI_LABELED_COLD,
      reason: "Previous cold email",
      messageId: "prev-msg",
      threadId: "prev-thread",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const email: EmailForLLM = {
      id: "msg1",
      from: "sender@example.com",
      to: emailAccount.email,
      subject: "Test",
      content: "Test content",
      date: new Date(),
    };

    const result = await isColdEmail({
      email,
      emailAccount,
      provider: mockProvider as never,
      coldEmailRule,
    });

    // Should be marked as cold email due to database check
    expect(result.isColdEmail).toBe(true);
    expect(result.reason).toBe("ai-already-labeled");

    // Provider should not be called since we already know it's a cold emailer
    expect(
      mockProvider.hasPreviousCommunicationsWithSenderOrDomain,
    ).not.toHaveBeenCalled();
  });
});
