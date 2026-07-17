import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewsletterStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import { extractEmailOrThrow, upsertSenderRecord } from "./record";

vi.mock("@/utils/prisma");

describe("sender-record", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.newsletter.updateManyAndReturn.mockResolvedValue([]);
    prisma.newsletter.upsert.mockResolvedValue({ id: "newsletter-1" } as any);
  });

  it("normalizes email addresses when upserting newsletter records", async () => {
    await upsertSenderRecord({
      emailAccountId: "email-account-1",
      newsletterEmail: "Sender <Sender@Example.COM>",
      changes: { status: NewsletterStatus.UNSUBSCRIBED },
    });

    expect(prisma.newsletter.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          email_emailAccountId: {
            email: "sender@example.com",
            emailAccountId: "email-account-1",
          },
        },
        create: expect.objectContaining({
          email: "sender@example.com",
          emailAccountId: "email-account-1",
          status: NewsletterStatus.UNSUBSCRIBED,
        }),
        update: { status: NewsletterStatus.UNSUBSCRIBED },
      }),
    );
  });

  it("updates every legacy casing variant instead of creating another record", async () => {
    prisma.$queryRaw.mockResolvedValue([
      { id: "newsletter-1" },
      { id: "newsletter-2" },
    ]);
    prisma.newsletter.updateManyAndReturn.mockResolvedValue([
      { id: "newsletter-1" } as any,
      { id: "newsletter-2" } as any,
    ]);

    await upsertSenderRecord({
      emailAccountId: "email-account-1",
      newsletterEmail: "Sender@Example.COM",
      changes: { status: null },
    });

    expect(prisma.newsletter.updateManyAndReturn).toHaveBeenCalledWith({
      where: { id: { in: ["newsletter-1", "newsletter-2"] } },
      data: { status: null },
    });
    expect(prisma.newsletter.upsert).not.toHaveBeenCalled();
  });

  it("throws for invalid newsletter emails", () => {
    expect(() => extractEmailOrThrow("invalid-email")).toThrow(
      "Invalid newsletter email address",
    );
  });
});
