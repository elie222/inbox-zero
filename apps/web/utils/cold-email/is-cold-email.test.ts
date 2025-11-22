import { describe, it, expect, vi, beforeEach } from "vitest";
import { isColdEmail, saveColdEmail } from "./is-cold-email";
import { getEmailAccount } from "@/__tests__/helpers";
import type { EmailForLLM } from "@/utils/types";
import { ColdEmailStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { extractEmailAddress } from "@/utils/email";

vi.mock("server-only", () => ({}));

vi.mock("@/utils/prisma", () => ({
  default: {
    coldEmail: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
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

    // First, simulate saving a cold email with normalized email address
    // This is what saveColdEmail does - it extracts just the email address
    vi.mocked(prisma.coldEmail.upsert).mockResolvedValue({
      id: "cold-email-id",
      emailAccountId: emailAccount.id,
      fromEmail: normalizedEmail,
      status: ColdEmailStatus.AI_LABELED_COLD,
      reason: "Test reason",
      messageId: "msg1",
      threadId: "thread1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await saveColdEmail({
      email: {
        from: normalizedEmail,
        id: "msg1",
        threadId: "thread1",
      },
      emailAccount,
      aiReason: "Test reason",
    });

    // Now simulate a second email from the same sender but with a different format
    // This is the bug scenario: the from field has a display name
    const secondEmail: EmailForLLM = {
      id: "msg2",
      from: `"Cold Sender" <${normalizedEmail}>`,
      to: emailAccount.email,
      subject: "Another cold email",
      content: "This is another cold email",
      date: new Date(),
    };

    // Mock Prisma to return the cold email record when queried with normalized email
    vi.mocked(prisma.coldEmail.findUnique).mockResolvedValue({
      id: "cold-email-id",
      emailAccountId: emailAccount.id,
      fromEmail: normalizedEmail,
      status: ColdEmailStatus.AI_LABELED_COLD,
      reason: "Test reason",
      messageId: "msg1",
      threadId: "thread1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await isColdEmail({
      email: secondEmail,
      emailAccount,
      provider: mockProvider as never,
      coldEmailRule: null,
    });

    // This test should pass after the fix - the sender should be recognized as cold
    expect(result.isColdEmail).toBe(true);
    expect(result.reason).toBe("ai-already-labeled");

    // Verify that findUnique was called with the normalized email address
    expect(prisma.coldEmail.findUnique).toHaveBeenCalledWith({
      where: {
        emailAccountId_fromEmail: {
          emailAccountId: emailAccount.id,
          fromEmail: normalizedEmail,
        },
        status: ColdEmailStatus.AI_LABELED_COLD,
      },
      select: { id: true },
    });
  });

  it("should handle various email formats consistently", async () => {
    const emailAccount = getEmailAccount({ id: "test-account-id" });
    const normalizedEmail = "sender@example.com";

    // Test different from field formats that should all resolve to the same normalized email
    const emailFormats = [
      normalizedEmail,
      `<${normalizedEmail}>`,
      `"Display Name" <${normalizedEmail}>`,
      `Display Name <${normalizedEmail}>`,
      `  ${normalizedEmail}  `, // with spaces
    ];

    // Mock Prisma to return cold email for normalized email
    vi.mocked(prisma.coldEmail.findUnique).mockImplementation(
      (args) =>
        new Promise((resolve) => {
          const where = args?.where as
            | {
                emailAccountId_fromEmail: {
                  emailAccountId: string;
                  fromEmail: string;
                };
                status: ColdEmailStatus;
              }
            | undefined;

          if (
            where?.emailAccountId_fromEmail.fromEmail === normalizedEmail &&
            where.status === ColdEmailStatus.AI_LABELED_COLD
          ) {
            resolve({
              id: "cold-email-id",
              emailAccountId: emailAccount.id,
              fromEmail: normalizedEmail,
              status: ColdEmailStatus.AI_LABELED_COLD,
              reason: "Test reason",
              messageId: "msg1",
              threadId: "thread1",
              createdAt: new Date(),
              updatedAt: new Date(),
            } as never);
          } else {
            resolve(null as never);
          }
        }) as never,
    );

    for (const fromFormat of emailFormats) {
      vi.clearAllMocks();

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
        coldEmailRule: null,
      });

      expect(result.isColdEmail).toBe(true);
      expect(result.reason).toBe("ai-already-labeled");

      // Verify extractEmailAddress was used to normalize
      const expectedNormalized = extractEmailAddress(fromFormat);
      expect(prisma.coldEmail.findUnique).toHaveBeenCalledWith({
        where: {
          emailAccountId_fromEmail: {
            emailAccountId: emailAccount.id,
            fromEmail: expectedNormalized,
          },
          status: ColdEmailStatus.AI_LABELED_COLD,
        },
        select: { id: true },
      });
    }
  });
});
