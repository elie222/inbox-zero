import { describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import {
  getSenderUnsubscribeSource,
  resolveSenderUnsubscribeSource,
} from "./source";

describe("getSenderUnsubscribeSource", () => {
  const logger = createTestLogger();

  it("prefers List-Unsubscribe from the sender's own mail", async () => {
    const emailProvider = {
      getMessagesFromSender: vi.fn().mockResolvedValue({
        messages: [
          {
            headers: { "list-unsubscribe": "<https://example.com/unsub>" },
            textHtml: '<a href="https://example.com/body">Unsubscribe</a>',
          },
        ],
      }),
    };

    expect(
      await getSenderUnsubscribeSource({
        senderEmail: "news@example.com",
        emailProvider: emailProvider as never,
        logger,
      }),
    ).toEqual({
      listUnsubscribeHeader: "<https://example.com/unsub>",
      unsubscribeLink: "https://example.com/body",
    });
  });

  it("keeps a client-supplied source instead of reading mail", async () => {
    const emailProvider = {
      getMessagesFromSender: vi.fn(),
    };

    await expect(
      resolveSenderUnsubscribeSource({
        senderEmail: "news@example.com",
        unsubscribeLink: "https://example.com/given",
        emailProvider: emailProvider as never,
        logger,
      }),
    ).resolves.toEqual({
      unsubscribeLink: "https://example.com/given",
      listUnsubscribeHeader: undefined,
    });
    expect(emailProvider.getMessagesFromSender).not.toHaveBeenCalled();
  });

  it("returns nothing when lookup fails", async () => {
    const emailProvider = {
      getMessagesFromSender: vi.fn().mockRejectedValue(new Error("boom")),
    };

    expect(
      await getSenderUnsubscribeSource({
        senderEmail: "news@example.com",
        emailProvider: emailProvider as never,
        logger,
      }),
    ).toEqual({});
  });
});
