import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MeetingBriefingData } from "@/utils/meeting-briefs/gather-context";

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({
  env: {
    PERPLEXITY_API_KEY: "test-key",
    DEFAULT_LLM_PROVIDER: "openai",
  },
}));
vi.mock("@/utils/llms/model", () => ({ getModel: vi.fn() }));
vi.mock("@/utils/llms", () => ({ createGenerateObject: vi.fn() }));
vi.mock("@/utils/stringify-email", () => ({
  stringifyEmailSimple: vi.fn(
    (email) =>
      `From: ${email.from}\nSubject: ${email.subject}\nBody: ${email.content}`,
  ),
}));
vi.mock("@/utils/get-email-from-message", () => ({
  getEmailForLLM: vi.fn((msg) => ({
    from: msg.headers?.from || "unknown",
    subject: msg.headers?.subject || "no subject",
    content: msg.textPlain || "no content",
  })),
}));

vi.doUnmock("@/utils/date");

import { buildPrompt } from "./generate-briefing";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildPrompt timezone handling", () => {
  it("formats past meeting times in the user's timezone (not UTC)", () => {
    // This test documents the timezone bug fix:
    // - Calendar API stores times in UTC
    // - A 4 PM BRT meeting is stored as 7 PM UTC
    // - The prompt should show 4 PM (user's local time), not 7 PM (UTC)

    const meetingAt4pmBRT = new Date("2024-12-30T19:00:00Z"); // 7 PM UTC = 4 PM BRT

    const briefingData: MeetingBriefingData = {
      event: {
        id: "upcoming",
        title: "Strategy Review",
        description: "Discuss Q1 roadmap",
        startTime: new Date("2024-12-31T21:00:00Z"),
        endTime: new Date("2024-12-31T22:00:00Z"),
        attendees: [
          { email: "user@company.com" },
          { email: "client@acme.com", name: "John Smith" },
        ],
      },
      externalGuests: [{ email: "client@acme.com", name: "John Smith" }],
      emailThreads: [],
      pastMeetings: [
        {
          id: "past-1",
          title: "Previous Call",
          description: "Discussed partnership opportunities",
          startTime: meetingAt4pmBRT,
          endTime: new Date("2024-12-30T20:00:00Z"),
          attendees: [{ email: "client@acme.com", name: "John Smith" }],
        },
      ],
    };

    const prompt = buildPrompt(briefingData, "America/Sao_Paulo");

    // The past meeting should show "4:00 PM" (Brazil time), NOT "7:00 PM" (UTC)
    expect(prompt).toMatchInlineSnapshot(`
      "Prepare a concise briefing for this upcoming meeting.

      <upcoming_meeting>
      Title: Strategy Review
      Description: Discuss Q1 roadmap
      </upcoming_meeting>

      <guest_context>
      <guest>
      Name: John Smith
      Email: client@acme.com

      <recent_meetings>
      <meeting>
      Title: Previous Call
      Date: Dec 30, 2024 at 4:00 PM
      Description: Discussed partnership opportunities
      </meeting>

      </recent_meetings>
      </guest>

      </guest_context>

      Available search tools: perplexitySearch, webSearch

      For each guest listed above:
      1. Review their email and meeting history provided
      2. Use search tools to find their professional background
      3. Once you have all information, call finalizeBriefing with the complete briefing"
    `);
  });

  it("shows no prior context for new contacts", () => {
    const briefingData: MeetingBriefingData = {
      event: {
        id: "upcoming",
        title: "Intro Meeting",
        startTime: new Date("2024-12-31T21:00:00Z"),
        endTime: new Date("2024-12-31T22:00:00Z"),
        attendees: [
          { email: "user@company.com" },
          { email: "newcontact@other.com", name: "New Person" },
        ],
      },
      externalGuests: [{ email: "newcontact@other.com", name: "New Person" }],
      emailThreads: [],
      pastMeetings: [],
    };

    const prompt = buildPrompt(briefingData, "America/Sao_Paulo");

    expect(prompt).toMatchInlineSnapshot(`
      "Prepare a concise briefing for this upcoming meeting.

      <upcoming_meeting>
      Title: Intro Meeting

      </upcoming_meeting>

      <guest_context>
      <guest>
      Name: New Person
      Email: newcontact@other.com

      <no_prior_context>This appears to be a new contact with no prior email or meeting history. Use search tools to find information about them.</no_prior_context>
      </guest>

      </guest_context>

      Available search tools: perplexitySearch, webSearch

      For each guest listed above:
      1. Review their email and meeting history provided
      2. Use search tools to find their professional background
      3. Once you have all information, call finalizeBriefing with the complete briefing"
    `);
  });
});
