import { describe, it, expect, vi, beforeEach } from "vitest";
import { isColdEmail, saveColdEmail } from "./is-cold-email";
import { getEmailAccount } from "@/__tests__/helpers";
import type { EmailForLLM } from "@/utils/types";
import { GroupItemType, GroupItemSource } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { extractEmailAddress } from "@/utils/email";

vi.mock("server-only", () => ({}));

vi.mock("@/utils/prisma", () => ({
  default: {
    rule: {
      findUnique: vi.fn(),
    },
    groupItem: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("./cold-email-rule", () => ({
  getColdEmailRule: vi.fn(),
}));

vi.mock("@/utils/rule/learned-patterns", () => ({
  saveLearnedPattern: vi.fn(),
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

import { getColdEmailRule } from "./cold-email-rule";
import { saveLearnedPattern } from "@/utils/rule/learned-patterns";

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
      exclude: false,
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

    // Verify that findFirst was called with the normalized email address
    expect(prisma.groupItem.findFirst).toHaveBeenCalledWith({
      where: {
        groupId,
        type: GroupItemType.FROM,
        value: normalizedEmail,
      },
      select: { exclude: true },
    });
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
        exclude: false,
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
        select: { exclude: true },
      });
    }
  });
});

describe("saveColdEmail", () => {
  it("should call saveLearnedPattern with correct parameters", async () => {
    const emailAccount = getEmailAccount({ id: "test-account-id" });
    const from = "test@example.com";
    const logger = { info: vi.fn() } as any;

    await saveColdEmail({
      email: { from, id: "msg1", threadId: "thread1" },
      emailAccount,
      aiReason: "test reason",
      logger,
    });

    expect(saveLearnedPattern).toHaveBeenCalledWith({
      emailAccountId: emailAccount.id,
      from,
      ruleName: "Cold Email",
      logger,
      reason: "test reason",
      messageId: "msg1",
      threadId: "thread1",
      source: GroupItemSource.AI,
    });
  });
});
