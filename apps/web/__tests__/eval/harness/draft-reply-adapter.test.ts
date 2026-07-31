import { describe, expect, it, vi } from "vitest";
import {
  describeContext,
  describeThread,
} from "@/__tests__/eval/harness/draft-reply-adapter";
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

  it("uses the product thread formatting and truncation", () => {
    const fixture = evalCase({ calendarBookingLink: null, bookingLinks: [] });
    fixture.input.messages[0] = {
      ...fixture.input.messages[0],
      cc: "copy@example.com",
      replyTo: "reply@example.com",
      date: "2026-05-12T08:30:00.000Z",
      content: `Start   here\n\n\n${"x".repeat(3100)}TAIL`,
    };

    const thread = describeThread(fixture);

    expect(thread).toContain("<replyTo>reply@example.com</replyTo>");
    expect(thread).toContain("<cc>copy@example.com</cc>");
    expect(thread).toContain("<date>2026-05-12T08:30:00.000Z</date>");
    expect(thread).toContain("<body>Start here\n\n");
    expect(thread).not.toContain("TAIL");
  });

  it("uses a stable model-visible date when the case does not set one", () => {
    const fixture = evalCase({ calendarBookingLink: null, bookingLinks: [] });
    fixture.input.messages[0] = {
      ...fixture.input.messages[0],
      date: "2026-05-12T08:30:00.000Z",
    };

    expect(describeContext(fixture)).toContain(
      "Today's date and time is: 2026-05-12T08:30:00.000Z.",
    );
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
