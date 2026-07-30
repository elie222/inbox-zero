import { describe, expect, it } from "vitest";
import { env } from "@/env";
import { runDraftReplyAssertions } from "@/__tests__/eval/harness/assertions";
import {
  draftReplyContextSchema,
  type DraftReplyCase,
} from "@/__tests__/eval/harness/draft-reply-schema";

const emptyInput: DraftReplyCase["input"] = {
  emailAccount: {
    email: "user@example.com",
    about: null,
    timezone: null,
    calendarBookingLink: null,
    bookingLinks: [],
  },
  messages: [],
  hasConfiguredSignature: false,
  currentDate: null,
  context: draftReplyContextSchema.parse({}),
};

function run(
  assertions: Parameters<typeof runDraftReplyAssertions>[0]["assertions"],
  reply: string,
  input: DraftReplyCase["input"] = emptyInput,
) {
  return runDraftReplyAssertions({
    assertions,
    output: { reply, confidence: "HIGH" },
    input,
  });
}

describe("draft reply assertions", () => {
  it("counts words and paragraphs on the produced reply", () => {
    const reply = "Yes, still on.\n\nSee you Thursday.";
    expect(
      run([{ type: "replyWordCountAtMost", max: 6 }], reply)[0]?.pass,
    ).toBe(true);
    expect(
      run([{ type: "replyWordCountAtMost", max: 4 }], reply)[0]?.pass,
    ).toBe(false);
    expect(
      run([{ type: "replyParagraphCountAtMost", max: 1 }], reply)[0]?.pass,
    ).toBe(false);
  });

  it("catches specific clock times when the case forbids proposing slots", () => {
    expect(
      run(
        [{ type: "replyOmitsCalendarSlotTimes" }],
        "I'll book via your link.",
      )[0]?.pass,
    ).toBe(true);
    expect(
      run(
        [{ type: "replyOmitsCalendarSlotTimes" }],
        "How about Tuesday at 2pm?",
      )[0]?.pass,
    ).toBe(false);
    expect(
      run(
        [{ type: "replyOmitsCalendarSlotTimes" }],
        "Tuesday 14:30 works for me.",
      )[0]?.pass,
    ).toBe(false);
  });

  it("fails when any single ask goes unaddressed", () => {
    const assertion = {
      type: "replyAddressesAllAsks" as const,
      asks: [
        { id: "a", description: "start date", matchAny: ["5 business days"] },
        { id: "b", description: "sso", matchAny: ["saml", "sso"] },
      ],
    };

    expect(
      run(
        [assertion],
        "Onboarding starts within 5 business days and SAML is included.",
      )[0]?.pass,
    ).toBe(true);
    const missed = run(
      [assertion],
      "Onboarding starts within 5 business days.",
    )[0];
    expect(missed?.pass).toBe(false);
    expect(missed?.detail).toContain("b");
  });

  it("matches urls case-insensitively and ignores a trailing slash", () => {
    const reply = "Grab a slot at HTTPS://CAL.EXAMPLE.COM/FOUNDER today.";
    expect(
      run(
        [{ type: "replyOmitsUrl", url: "https://cal.example.com/founder/" }],
        reply,
      )[0]?.pass,
    ).toBe(false);
  });

  it("checks the booking link the product would emit, not the one the case declares", () => {
    const withBothLinks: DraftReplyCase["input"] = {
      ...emptyInput,
      emailAccount: {
        ...emptyInput.emailAccount,
        calendarBookingLink: "https://cal.example.com/founder",
        bookingLinks: [{ slug: "founder" }],
      },
    };
    const reply = `Book a slot: ${env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "")}/book/founder`;

    // The native link wins, so a literal check against the external URL is a
    // free pass. This is the failure replyOmitsBookingLink exists to close.
    expect(
      run(
        [{ type: "replyOmitsUrl", url: "https://cal.example.com/founder" }],
        reply,
        withBothLinks,
      )[0]?.pass,
    ).toBe(true);

    expect(
      run([{ type: "replyOmitsBookingLink" }], reply, withBothLinks)[0]?.pass,
    ).toBe(false);
  });
});
