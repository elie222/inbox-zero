import { describe, expect, it } from "vitest";
import { NewsletterStatus } from "@/generated/prisma/enums";
import type { EmailFilter } from "@/utils/email/types";
import { GmailLabel } from "@/utils/gmail/label";
import type { EmailProvider } from "@/utils/email/types";
import {
  findAutoArchiveFilters,
  findNewsletterStatus,
  findSenderLabelFilters,
} from "./filters";

describe("findNewsletterStatus", () => {
  it("matches sender addresses case-insensitively", () => {
    expect(
      findNewsletterStatus(
        [
          {
            email: "Sender@Example.COM",
            status: NewsletterStatus.UNSUBSCRIBED,
          },
        ],
        "sender@example.com",
      ),
    ).toBe(NewsletterStatus.UNSUBSCRIBED);
  });

  it("preserves a handled status when a legacy duplicate is unhandled", () => {
    expect(
      findNewsletterStatus(
        [
          { email: "sender@example.com", status: null },
          {
            email: "Sender@Example.COM",
            status: NewsletterStatus.UNSUBSCRIBED,
          },
        ],
        "SENDER@example.com",
      ),
    ).toBe(NewsletterStatus.UNSUBSCRIBED);
  });

  it("does not match invalid sender values", () => {
    expect(
      findNewsletterStatus(
        [
          {
            email: "invalid stored sender",
            status: NewsletterStatus.UNSUBSCRIBED,
          },
        ],
        "invalid message sender",
      ),
    ).toBeUndefined();
  });
});

describe("findSenderLabelFilters", () => {
  it("returns label-only filters for the sender", () => {
    const filters: EmailFilter[] = [
      {
        id: "filter-1",
        criteria: { from: "updates@example.com" },
        action: { addLabelIds: ["Label_123"] },
      },
      {
        id: "filter-2",
        criteria: { from: "other@example.com" },
        action: { addLabelIds: ["Label_456"] },
      },
    ];

    expect(
      findSenderLabelFilters(filters, "Updates <updates@example.com>"),
    ).toEqual([{ id: "filter-1", labelId: "Label_123" }]);
  });

  it("does not return auto-archive filters that also apply a label", () => {
    const filters: EmailFilter[] = [
      {
        id: "archive-filter",
        criteria: { from: "updates@example.com" },
        action: {
          removeLabelIds: [GmailLabel.INBOX],
          addLabelIds: ["Label_123"],
        },
      },
      {
        id: "label-filter",
        criteria: { from: "updates@example.com" },
        action: { addLabelIds: ["Label_456"] },
      },
    ];

    expect(findSenderLabelFilters(filters, "updates@example.com")).toEqual([
      { id: "label-filter", labelId: "Label_456" },
    ]);
  });

  it("matches filters with a display-name sender criterion", () => {
    const filters: EmailFilter[] = [
      {
        id: "filter-1",
        criteria: { from: "Example Updates <updates@example.com>" },
        action: { addLabelIds: ["Label_123"] },
      },
    ];

    expect(findSenderLabelFilters(filters, "updates@example.com")).toEqual([
      { id: "filter-1", labelId: "Label_123" },
    ]);
  });

  it("does not match filters with empty sender criteria", () => {
    const filters: EmailFilter[] = [
      {
        id: "filter-1",
        criteria: { from: "" },
        action: { addLabelIds: ["Label_123"] },
      },
      {
        id: "filter-2",
        criteria: {},
        action: { addLabelIds: ["Label_456"] },
      },
    ];

    expect(findSenderLabelFilters(filters, "updates@example.com")).toEqual([]);
  });

  it("does not match every filter when the sender email is empty", () => {
    const filters: EmailFilter[] = [
      {
        id: "filter-1",
        criteria: { from: "updates@example.com" },
        action: { addLabelIds: ["Label_123"] },
      },
    ];

    expect(findSenderLabelFilters(filters, "")).toEqual([]);
  });
});

describe("findAutoArchiveFilters", () => {
  const gmail = { name: "google" } as EmailProvider;

  function archiveFilter(id: string, from: string): EmailFilter {
    return {
      id,
      criteria: { from },
      action: { removeLabelIds: [GmailLabel.INBOX] },
    };
  }

  it("does not match a sender whose address is part of another sender's", () => {
    const filters = [
      archiveFilter("newsletter", "newsletter@shop.com"),
      archiveFilter("acme-com", "hello@acme.com"),
    ];

    expect(findAutoArchiveFilters(filters, "letter@shop.com", gmail)).toEqual(
      [],
    );
    expect(findAutoArchiveFilters(filters, "hello@acme.co", gmail)).toEqual([]);
  });

  it("matches a sender listed among several in one filter", () => {
    const filters = [
      archiveFilter("or", "a@shop.com OR b@shop.com"),
      archiveFilter("braces", "{c@shop.com d@shop.com}"),
      archiveFilter("named", "Shop News <News@Shop.com>"),
    ];

    expect(
      findAutoArchiveFilters(filters, "b@shop.com", gmail).map((f) => f.id),
    ).toEqual(["or"]);
    expect(
      findAutoArchiveFilters(filters, "d@shop.com", gmail).map((f) => f.id),
    ).toEqual(["braces"]);
    expect(
      findAutoArchiveFilters(filters, "Shop <news@shop.com>", gmail).map(
        (f) => f.id,
      ),
    ).toEqual(["named"]);
  });
});
