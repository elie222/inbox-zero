import { describe, expect, it, vi } from "vitest";
import { describeContext } from "@/__tests__/eval/harness/draft-reply-adapter";
import {
  draftReplyCaseSchema,
  type DraftReplyCase,
} from "@/__tests__/eval/harness/draft-reply-schema";

vi.mock("server-only", () => ({}));

describe("describeContext", () => {
  it("uses the active Inbox Zero booking link ahead of the external link", () => {
    const context = describeContext(
      evalCase({
        calendarBookingLink: "https://cal.example.com/external",
        bookingLinks: [{ slug: "active-booking-link" }],
      }),
    );

    expect(context).toContain(
      "<booking_link>\nhttp://localhost:3000/book/active-booking-link\n</booking_link>",
    );
    expect(context).not.toContain("https://cal.example.com/external");
  });

  it("uses the external booking link when no Inbox Zero link is active", () => {
    const context = describeContext(
      evalCase({
        calendarBookingLink: "https://cal.example.com/external",
        bookingLinks: [],
      }),
    );

    expect(context).toContain(
      "<booking_link>\nhttps://cal.example.com/external\n</booking_link>",
    );
  });

  it("does not add a booking-link block when the account has no link", () => {
    const context = describeContext(
      evalCase({ calendarBookingLink: null, bookingLinks: [] }),
    );

    expect(context).not.toContain("<booking_link>");
  });
});

function evalCase(
  emailAccount: Pick<
    DraftReplyCase["input"]["emailAccount"],
    "calendarBookingLink" | "bookingLinks"
  >,
): DraftReplyCase {
  return draftReplyCaseSchema.parse({
    id: "booking-link-context",
    suite: "draft-reply",
    split: "dev",
    tags: [],
    difficultyAxes: ["absence-pressure"],
    difficulty: "easy",
    provenance: { kind: "handwritten", reviewedBy: null },
    input: {
      emailAccount: {
        email: "sender@example.com",
        about: null,
        timezone: "UTC",
        ...emailAccount,
      },
      messages: [
        {
          from: "recipient@example.com",
          to: "sender@example.com",
          subject: "Meeting",
          content: "How can I schedule time with you?",
        },
      ],
      context: {},
    },
    expectedGroundTruth: "Share the available booking link.",
  });
}
