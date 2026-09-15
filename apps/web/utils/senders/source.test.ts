import { describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { getSenderUnsubscribeSource } from "./source";

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
