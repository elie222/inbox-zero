import { describe, expect, it } from "vitest";
import { NewsletterStatus } from "@/generated/prisma/enums";
import {
  getSuggestedModeRows,
  getUnsubscribeSuggestions,
  isUnsubscribeSuggestion,
} from "./suggestions";

describe("isUnsubscribeSuggestion", () => {
  it("suggests senders with a low read rate", () => {
    expect(
      isUnsubscribeSuggestion({
        value: 10,
        unsubscribeLink: "https://example.com/unsubscribe",
        readEmails: 1,
      }),
    ).toBe(true);
    expect(
      isUnsubscribeSuggestion({
        value: 10,
        unsubscribeLink: "https://example.com/unsubscribe",
        readEmails: 0,
      }),
    ).toBe(true);
  });

  it("does not suggest senders the user reads", () => {
    expect(
      isUnsubscribeSuggestion({
        value: 10,
        unsubscribeLink: "https://example.com/unsubscribe",
        readEmails: 2,
      }),
    ).toBe(false);
    expect(
      isUnsubscribeSuggestion({
        value: 10,
        unsubscribeLink: "https://example.com/unsubscribe",
        readEmails: 9,
      }),
    ).toBe(false);
  });

  it("does not suggest senders with too few emails", () => {
    expect(
      isUnsubscribeSuggestion({
        value: 1,
        unsubscribeLink: "https://example.com/unsubscribe",
        readEmails: 0,
      }),
    ).toBe(false);
    expect(
      isUnsubscribeSuggestion({
        value: 2,
        unsubscribeLink: "https://example.com/unsubscribe",
        readEmails: 0,
      }),
    ).toBe(false);
  });

  it("does not suggest senders the user already handled", () => {
    expect(
      isUnsubscribeSuggestion({
        value: 10,
        unsubscribeLink: "https://example.com/unsubscribe",
        readEmails: 0,
        status: NewsletterStatus.APPROVED,
      }),
    ).toBe(false);
    expect(
      isUnsubscribeSuggestion({
        value: 10,
        unsubscribeLink: "https://example.com/unsubscribe",
        readEmails: 0,
        status: NewsletterStatus.UNSUBSCRIBED,
      }),
    ).toBe(false);
    expect(
      isUnsubscribeSuggestion({
        value: 10,
        unsubscribeLink: "https://example.com/unsubscribe",
        readEmails: 0,
        autoArchived: { id: "filter-1" },
      }),
    ).toBe(false);
  });

  it.each([
    null,
    undefined,
    "",
    "invalid",
    "ftp://example.com/unsubscribe",
  ])("does not suggest a low-read sender with an unusable unsubscribe link: %s", (unsubscribeLink) => {
    expect(
      isUnsubscribeSuggestion({ value: 10, readEmails: 0, unsubscribeLink }),
    ).toBe(false);
  });

  it.each([
    "https://example.com/unsubscribe",
    "http://example.com/unsubscribe",
    "mailto:unsubscribe@example.com",
  ])("suggests a low-read sender with an unsubscribe link: %s", (unsubscribeLink) => {
    expect(
      isUnsubscribeSuggestion({ value: 10, readEmails: 0, unsubscribeLink }),
    ).toBe(true);
  });
});

describe("getUnsubscribeSuggestions", () => {
  it("keeps only suggested senders, ordered by email count descending", () => {
    const wellRead = {
      name: "read",
      value: 50,
      unsubscribeLink: "https://example.com/unsubscribe",
      readEmails: 45,
    };
    const small = {
      name: "small",
      value: 5,
      unsubscribeLink: "https://example.com/unsubscribe",
      readEmails: 0,
    };
    const big = {
      name: "big",
      value: 30,
      unsubscribeLink: "https://example.com/unsubscribe",
      readEmails: 1,
    };
    const handled = {
      name: "handled",
      value: 20,
      unsubscribeLink: "https://example.com/unsubscribe",
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
    expect(
      getUnsubscribeSuggestions([
        {
          value: 10,
          unsubscribeLink: "https://example.com/unsubscribe",
          readEmails: 8,
        },
      ]),
    ).toEqual([]);
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
    const missing = {
      name: "missing",
      value: 50,
      unsubscribeLink: null,
      readEmails: 1,
    };

    expect(getUnsubscribeSuggestions([missing, manual, automatic])).toEqual([
      manual,
      automatic,
    ]);

    expect(
      getUnsubscribeSuggestions([missing, manual, automatic], {
        requireAutomaticUnsubscribeLink: true,
      }),
    ).toEqual([automatic]);
  });
});

describe("getSuggestedModeRows", () => {
  it("shows suggestions and retains other selected senders", () => {
    const suggested = {
      name: "suggested",
      value: 10,
      unsubscribeLink: "https://example.com/unsubscribe",
      readEmails: 1,
    };
    const selected = {
      name: "selected",
      value: 10,
      unsubscribeLink: null,
      readEmails: 8,
    };
    const hidden = {
      name: "hidden",
      value: 10,
      unsubscribeLink: "https://example.com/unsubscribe",
      readEmails: 7,
    };

    const missing = {
      name: "missing",
      value: 20,
      readEmails: 0,
      unsubscribeLink: null,
    };
    const manual = {
      name: "manual",
      value: 10,
      readEmails: 0,
      unsubscribeLink: "mailto:unsubscribe@example.com",
    };
    const selectedMissing = {
      name: "selected-missing",
      value: 20,
      readEmails: 0,
      unsubscribeLink: null,
    };

    expect(
      getSuggestedModeRows(
        [suggested, selected, hidden, missing, manual, selectedMissing],
        new Map([
          [selected.name, true],
          [selectedMissing.name, true],
          [hidden.name, false],
        ]),
      ),
    ).toEqual([suggested, selected, manual, selectedMissing]);
  });
});
