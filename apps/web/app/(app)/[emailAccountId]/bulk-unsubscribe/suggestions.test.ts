import { describe, expect, it } from "vitest";
import { NewsletterStatus } from "@/generated/prisma/enums";
import {
  getUnsubscribeSuggestions,
  isUnsubscribeSuggestion,
} from "./suggestions";

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

  it("does not require an unsubscribe link by default", () => {
    expect(
      isUnsubscribeSuggestion({
        value: 10,
        readEmails: 0,
      }),
    ).toBe(true);
  });
});

describe("getUnsubscribeSuggestions", () => {
  it("keeps only suggested senders, ordered by email count descending", () => {
    const wellRead = { name: "read", value: 50, readEmails: 45 };
    const small = { name: "small", value: 5, readEmails: 0 };
    const big = { name: "big", value: 30, readEmails: 1 };
    const handled = {
      name: "handled",
      value: 20,
      readEmails: 0,
      status: NewsletterStatus.UNSUBSCRIBED,
    };

    expect(getUnsubscribeSuggestions([wellRead, small, handled, big])).toEqual([
      big,
      small,
    ]);
  });

  it("returns an empty list when nothing qualifies", () => {
    expect(getUnsubscribeSuggestions([])).toEqual([]);
    expect(getUnsubscribeSuggestions([{ value: 10, readEmails: 8 }])).toEqual(
      [],
    );
  });

  it("can keep only low-read senders with automatic unsubscribe links", () => {
    const automatic = {
      name: "automatic",
      value: 30,
      readEmails: 1,
      unsubscribeLink: "https://example.com/unsubscribe",
    };
    const manual = {
      name: "manual",
      value: 40,
      readEmails: 1,
      unsubscribeLink: "mailto:unsubscribe@example.com",
    };
    const missing = { name: "missing", value: 50, readEmails: 1 };

    expect(
      getUnsubscribeSuggestions([missing, manual, automatic], {
        requireAutomaticUnsubscribeLink: true,
      }),
    ).toEqual([automatic]);
  });
});
