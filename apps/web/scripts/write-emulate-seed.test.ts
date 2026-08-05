import { describe, expect, it } from "vitest";
import { buildEmulatorSeed } from "./write-emulate-seed";

const NOW = Date.UTC(2026, 7, 5, 12);
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

describe("buildEmulatorSeed", () => {
  it("keeps demo mail current and includes a deterministic unsubscribe suggestion", () => {
    const seed = buildEmulatorSeed(NOW);
    const messages = seed.google.messages;

    expect(
      messages.every((message) => {
        const timestamp = Number(message.internal_date);
        return timestamp <= NOW && timestamp > NOW - NINETY_DAYS_MS;
      }),
    ).toBe(true);

    const suggestedSenderMessages = messages.filter(
      (message) => message.from === "Inbox Offers <offers@example.test>",
    );

    expect(suggestedSenderMessages).toHaveLength(12);
    expect(
      suggestedSenderMessages.filter((message) =>
        message.label_ids.includes("UNREAD"),
      ),
    ).toHaveLength(11);
  });
});
