import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewsletterStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import {
  setNewsletterStatus,
  unsubscribeSenderAndMark,
} from "./newsletter-unsubscribe";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");

describe("newsletter-unsubscribe", () => {
  const logger = createScopedLogger("newsletter-unsubscribe-test");

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.newsletter.upsert.mockResolvedValue({ id: "newsletter-1" } as any);
  });

  it("normalizes sender emails when setting status", async () => {
    await setNewsletterStatus({
      emailAccountId: "email-account-1",
      newsletterEmail: "Sender <sender@example.com>",
      status: NewsletterStatus.UNSUBSCRIBED,
    });

    expect(prisma.newsletter.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          email_emailAccountId: {
            email: "sender@example.com",
            emailAccountId: "email-account-1",
          },
        },
      }),
    );
  });

  it("marks sender as unsubscribed even when no unsubscribe URL is available", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await unsubscribeSenderAndMark({
      emailAccountId: "email-account-1",
      newsletterEmail: "sender@example.com",
      logger,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.unsubscribe).toEqual({
      attempted: false,
      success: false,
      reason: "no_unsubscribe_url",
    });
    expect(prisma.newsletter.upsert).toHaveBeenCalledTimes(1);
  });

  it("attempts one-click unsubscribe with POST when an HTTP URL is available", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 200 }));

    const result = await unsubscribeSenderAndMark({
      emailAccountId: "email-account-1",
      newsletterEmail: "sender@example.com",
      unsubscribeLink: "https://example.com/unsubscribe?id=1",
      logger,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/unsubscribe?id=1",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(result.unsubscribe).toEqual(
      expect.objectContaining({
        attempted: true,
        success: true,
        method: "post",
        statusCode: 200,
      }),
    );
    expect(prisma.newsletter.upsert).toHaveBeenCalledTimes(1);
  });

  it("allows bracketed public IPv6 unsubscribe URLs", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 200 }));

    const result = await unsubscribeSenderAndMark({
      emailAccountId: "email-account-1",
      newsletterEmail: "sender@example.com",
      unsubscribeLink: "https://[2001:4860:4860::8888]/unsubscribe",
      logger,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://[2001:4860:4860::8888]/unsubscribe",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(result.unsubscribe).toEqual(
      expect.objectContaining({
        attempted: true,
        success: true,
        method: "post",
        statusCode: 200,
      }),
    );
    expect(prisma.newsletter.upsert).toHaveBeenCalledTimes(1);
  });
});
