import { describe, it, expect, vi, beforeEach } from "vitest";
import { isColdEmail } from "./is-cold-email";
import { getEmailAccount } from "@/__tests__/helpers";
import type { EmailForLLM } from "@/utils/types";
import { GroupItemType } from "@/generated/prisma/enums";
import { env } from "@/env";
import prisma from "@/utils/__mocks__/prisma";
import { extractEmailAddress } from "@/utils/email";
import { createGenerateObject } from "@/utils/llms";

vi.mock("@/utils/prisma");

vi.mock("./cold-email-rule", () => ({
  getColdEmailRule: vi.fn(),
}));

vi.mock("@/utils/email", async () => {
  const actual =
    await vi.importActual<typeof import("@/utils/email")>("@/utils/email");
  return {
    ...actual,
  };
});

vi.mock("@/utils/llms", () => ({
  createGenerateObject: vi.fn(() => vi.fn()),
}));

const mockProvider = {
  hasPreviousCommunicationsWithSenderOrDomain: vi.fn().mockResolvedValue(false),
};

describe("isColdEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should recognize a known cold email sender even when from field format differs", async () => {
    const emailAccount = getEmailAccount({ id: "test-account-id" });
    const normalizedEmail = "cold.sender@example.com";
    const groupId = "test-group-id";

    // Mock groupItem lookup
    vi.mocked(prisma.groupItem.findFirst).mockResolvedValue({
      id: "group-item-id",
      type: GroupItemType.FROM,
      value: normalizedEmail,
      exclude: false,
      group: { id: groupId, name: "Cold Email" },
    } as any);

    const email: EmailForLLM = {
      id: "msg2",
      from: `"Cold Sender" <${normalizedEmail}>`,
      to: emailAccount.email,
      subject: "Another cold email",
      content: "This is another cold email",
      date: new Date(),
    };

    const result = await isColdEmail({
      email,
      emailAccount,
      provider: mockProvider as never,
      coldEmailRule: { instructions: "test instructions", groupId },
    });

    expect(result.isColdEmail).toBe(true);
    expect(result.reason).toBe("ai-already-labeled");
    expect(result.patternMatch).toEqual({
      group: { id: groupId, name: "Cold Email" },
      groupItem: {
        id: "group-item-id",
        type: GroupItemType.FROM,
        value: normalizedEmail,
        exclude: false,
      },
    });

    // Verify that findFirst was called with the normalized email address
    expect(prisma.groupItem.findFirst).toHaveBeenCalledWith({
      where: {
        groupId,
        type: GroupItemType.FROM,
        value: normalizedEmail,
      },
      select: {
        id: true,
        type: true,
        value: true,
        exclude: true,
        group: { select: { id: true, name: true } },
      },
    });
  });

  it("should return excluded when sender is explicitly excluded from cold email blocker", async () => {
    const emailAccount = getEmailAccount({ id: "test-account-id" });
    const normalizedEmail = "excluded.sender@example.com";
    const groupId = "test-group-id";

    // Mock groupItem lookup with exclude: true
    vi.mocked(prisma.groupItem.findFirst).mockResolvedValue({
      id: "group-item-id",
      type: GroupItemType.FROM,
      value: normalizedEmail,
      exclude: true,
      group: { id: groupId, name: "Cold Email" },
    } as any);

    const email: EmailForLLM = {
      id: "msg-excluded",
      from: `"Excluded Sender" <${normalizedEmail}>`,
      to: emailAccount.email,
      subject: "Not a cold email",
      content: "This sender was explicitly excluded",
      date: new Date(),
    };

    const result = await isColdEmail({
      email,
      emailAccount,
      provider: mockProvider as never,
      coldEmailRule: { instructions: "test instructions", groupId },
    });

    expect(result.isColdEmail).toBe(false);
    expect(result.reason).toBe("excluded");

    expect(prisma.groupItem.findFirst).toHaveBeenCalledWith({
      where: {
        groupId,
        type: GroupItemType.FROM,
        value: normalizedEmail,
      },
      select: {
        id: true,
        type: true,
        value: true,
        exclude: true,
        group: { select: { id: true, name: true } },
      },
    });
  });

  // Guarded here rather than only at the actions, so a colleague is never labelled
  // or archived either.
  it("should not classify a colleague as cold", async () => {
    vi.mocked(prisma.groupItem.findFirst).mockResolvedValue(null);

    const result = await isColdEmail({
      email: {
        id: "msg-internal",
        from: "ceo@company.com",
        to: "user@company.com",
        subject: "Quick favour",
        content: "Can you take a look at this?",
        date: new Date(),
      },
      emailAccount: getEmailAccount({
        id: "test-account-id",
        email: "user@company.com",
      }),
      provider: mockProvider as never,
      coldEmailRule: { instructions: "test instructions", groupId: "group-id" },
    });

    expect(result.isColdEmail).toBe(false);
    expect(
      mockProvider.hasPreviousCommunicationsWithSenderOrDomain,
    ).not.toHaveBeenCalled();
  });

  it("should not classify a colleague as cold when a learned pattern exists", async () => {
    vi.mocked(prisma.groupItem.findFirst).mockResolvedValue({
      id: "group-item-id",
      type: GroupItemType.FROM,
      value: "ceo@company.com",
      exclude: false,
      group: { id: "group-id", name: "Cold Email" },
    } as any);

    const result = await isColdEmail({
      email: {
        id: "msg-internal",
        from: "ceo@company.com",
        to: "user@company.com",
        subject: "Quick favour",
        content: "Can you take a look at this?",
        date: new Date(),
      },
      emailAccount: getEmailAccount({
        id: "test-account-id",
        email: "user@company.com",
      }),
      provider: mockProvider as never,
      coldEmailRule: { instructions: "test instructions", groupId: "group-id" },
    });

    expect(result.isColdEmail).toBe(false);
  });

  it("should not classify the application notification sender as cold", async () => {
    const result = await isColdEmail({
      email: {
        id: "msg-application-notification",
        from: env.RESEND_FROM_EMAIL,
        to: "user@customer.test",
        subject: "Product update",
        content: "Here is the latest product update.",
        date: new Date(),
      },
      emailAccount: getEmailAccount({
        id: "test-account-id",
        email: "user@customer.test",
      }),
      provider: mockProvider as never,
      coldEmailRule: { instructions: "test instructions", groupId: "group-id" },
    });

    expect(result.isColdEmail).toBe(false);
    expect(result.reason).toBe("applicationSender");
    expect(prisma.groupItem.findFirst).not.toHaveBeenCalled();
    expect(
      mockProvider.hasPreviousCommunicationsWithSenderOrDomain,
    ).not.toHaveBeenCalled();
    expect(createGenerateObject).not.toHaveBeenCalled();
  });

  // Blocking a sender we could not verify is worse than missing a cold email.
  it("should not classify as cold when prior contact cannot be checked", async () => {
    vi.mocked(prisma.groupItem.findFirst).mockResolvedValue(null);

    const result = await isColdEmail({
      email: {
        id: "msg-no-date",
        from: "unknown@example.com",
        to: "user@test.com",
        subject: "Hello",
        content: "Hello",
        date: undefined as never,
      },
      emailAccount: getEmailAccount({ id: "test-account-id" }),
      provider: mockProvider as never,
      coldEmailRule: { instructions: "test instructions", groupId: "group-id" },
    });

    expect(result.isColdEmail).toBe(false);
    expect(result.reason).toBe("hasPreviousEmail");
  });

  it("should handle various email formats consistently", async () => {
    const emailAccount = getEmailAccount({ id: "test-account-id" });
    const normalizedEmail = "sender@example.com";
    const groupId = "test-group-id";

    vi.mocked(prisma.groupItem.findFirst).mockResolvedValue({
      id: "group-item-id",
      exclude: false,
    } as any);

    const emailFormats = [
      normalizedEmail,
      `<${normalizedEmail}>`,
      `"Display Name" <${normalizedEmail}>`,
      `Display Name <${normalizedEmail}>`,
      `  ${normalizedEmail}  `,
    ];

    for (const fromFormat of emailFormats) {
      vi.clearAllMocks();
      vi.mocked(prisma.groupItem.findFirst).mockResolvedValue({
        id: "group-item-id",
        type: GroupItemType.FROM,
        value: normalizedEmail,
        exclude: false,
        group: { id: groupId, name: "Cold Email" },
      } as any);

      const email: EmailForLLM = {
        id: "msg-test",
        from: fromFormat,
        to: emailAccount.email,
        subject: "Test",
        content: "Test content",
        date: new Date(),
      };

      const result = await isColdEmail({
        email,
        emailAccount,
        provider: mockProvider as never,
        coldEmailRule: { instructions: "test instructions", groupId },
      });

      expect(result.isColdEmail).toBe(true);
      expect(result.reason).toBe("ai-already-labeled");

      const expectedNormalized =
        extractEmailAddress(fromFormat) || fromFormat.trim();
      expect(prisma.groupItem.findFirst).toHaveBeenCalledWith({
        where: {
          groupId,
          type: GroupItemType.FROM,
          value: expectedNormalized,
        },
        select: {
          id: true,
          type: true,
          value: true,
          exclude: true,
          group: { select: { id: true, name: true } },
        },
      });
    }
  });
});
