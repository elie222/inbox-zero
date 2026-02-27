import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewsletterStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import {
  extractEmailOrThrow,
  upsertNewsletterRecord,
} from "./newsletter-record";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");

describe("newsletter-record", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.newsletter.upsert.mockResolvedValue({ id: "newsletter-1" } as any);
  });

  it("normalizes email addresses when upserting newsletter records", async () => {
    await upsertNewsletterRecord({
      emailAccountId: "email-account-1",
      newsletterEmail: "Sender <sender@example.com>",
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

  it("throws for invalid newsletter emails", () => {
    expect(() => extractEmailOrThrow("invalid-email")).toThrow(
      "Invalid newsletter email address",
    );
  });
});
