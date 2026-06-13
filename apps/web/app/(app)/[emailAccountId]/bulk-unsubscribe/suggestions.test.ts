import { describe, expect, it } from "vitest";
import { NewsletterStatus } from "@/generated/prisma/enums";
import { isUnsubscribeSuggestion } from "./suggestions";

describe("isUnsubscribeSuggestion", () => {
  it("suggests senders with a low read rate", () => {
    expect(isUnsubscribeSuggestion({ value: 10, readEmails: 1 })).toBe(true);
    expect(isUnsubscribeSuggestion({ value: 10, readEmails: 0 })).toBe(true);
  });

  it("does not suggest senders the user reads", () => {
    expect(isUnsubscribeSuggestion({ value: 10, readEmails: 2 })).toBe(false);
    expect(isUnsubscribeSuggestion({ value: 10, readEmails: 9 })).toBe(false);
  });

  it("does not suggest senders with too few emails", () => {
    expect(isUnsubscribeSuggestion({ value: 1, readEmails: 0 })).toBe(false);
    expect(isUnsubscribeSuggestion({ value: 2, readEmails: 0 })).toBe(false);
  });

  it("does not suggest senders the user already handled", () => {
    expect(
      isUnsubscribeSuggestion({
        value: 10,
        readEmails: 0,
        status: NewsletterStatus.APPROVED,
      }),
    ).toBe(false);
    expect(
      isUnsubscribeSuggestion({
        value: 10,
        readEmails: 0,
        status: NewsletterStatus.UNSUBSCRIBED,
      }),
    ).toBe(false);
    expect(
      isUnsubscribeSuggestion({
        value: 10,
        readEmails: 0,
        autoArchived: { id: "filter-1" },
      }),
    ).toBe(false);
  });
});
