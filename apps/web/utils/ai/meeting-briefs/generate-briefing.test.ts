import { getMockMessage } from "@/__tests__/helpers";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MeetingBriefingData } from "@/utils/meeting-briefs/gather-context";

const { mockGetModel, mockOpenRouterWebSearch } = vi.hoisted(() => ({
  mockGetModel: vi.fn(),
  mockOpenRouterWebSearch: vi.fn(() => ({ type: "provider" })),
}));

vi.mock("@/env", () => ({
  env: {
    PERPLEXITY_API_KEY: "test-key",
    DEFAULT_LLMS: "openai:gpt-5.4-mini",
    EMAIL_ENCRYPT_SECRET: "test-encrypt-secret-for-testing",
    EMAIL_ENCRYPT_SALT: "test-encrypt-salt-for-testing",
  },
}));
vi.mock("@/utils/llms/model", () => ({
  getModel: mockGetModel,
}));
vi.mock("@/utils/llms", () => ({ createGenerateObject: vi.fn() }));
vi.mock("@openrouter/ai-sdk-provider", () => ({
  openrouter: { tools: { webSearch: mockOpenRouterWebSearch } },
}));
vi.mock("@/utils/ai/helpers", () => ({
  getUserInfoPrompt: vi.fn(
    ({ emailAccount }) =>
      `The user you are acting on behalf of is:
<user_info>
<email>${emailAccount.email}</email>
<about>${emailAccount.about}</about>
</user_info>`,
  ),
}));
vi.doUnmock("@/utils/date");

import { buildPrompt, formatMeetingForContext } from "./generate-briefing";
import { getWebSearchConfigForProvider } from "@/utils/ai/web-search";
import type { EmailAccountWithAI } from "@/utils/llms/types";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetModel.mockReturnValue({
    provider: "openai",
    modelName: "gpt-5.4-mini",
    model: { id: "model" },
    fallbackModels: [],
    hasUserApiKey: false,
  });
});

describe("buildPrompt timezone handling", () => {
  const mockEmailAccount = {
    email: "user@company.com",
    timezone: "America/Sao_Paulo",
    about: "I am a product manager at Company Inc.",
  } as EmailAccountWithAI;
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
      internalTeamMembers: [],
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

    const prompt = buildPrompt(briefingData, mockEmailAccount, [
      "perplexitySearch",
      "webSearch",
    ]);

    // The past meeting should show "4:00 PM" (Brazil time), NOT "7:00 PM" (UTC)
    expect(prompt).toContain("Dec 30, 2024 at 4:00 PM");
    expect(prompt).toContain("Dec 31, 2024 at 6:00 PM");
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
      internalTeamMembers: [],
      emailThreads: [],
      pastMeetings: [],
    };

    const prompt = buildPrompt(briefingData, mockEmailAccount, [
      "perplexitySearch",
      "webSearch",
    ]);

    expect(prompt).toContain("<no_prior_context>");
    expect(prompt).toContain("newcontact@other.com");
  });

  it("only advertises the search tools built for the account", () => {
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
      internalTeamMembers: [],
      emailThreads: [],
      pastMeetings: [],
    };

    const prompt = buildPrompt(briefingData, mockEmailAccount, [
      "perplexitySearch",
    ]);

    expect(prompt).toContain("Available search tools: perplexitySearch");
    expect(prompt).not.toContain("webSearch");
  });

  it("preserves dated replies from non-attendees and attachment metadata once per thread", () => {
    const reply = {
      ...getMockMessage({
        from: "engineer@example.org",
        textPlain: "The check now passes; waiting for approval.",
        textHtml: "",
        attachments: [
          { filename: "report.pdf", mimeType: "application/pdf", size: 100 },
        ],
      }),
      internalDate: String(Date.UTC(2026, 0, 2, 12)),
    };
    const data: MeetingBriefingData = {
      event: {
        id: "review",
        title: "Review",
        startTime: new Date("2026-01-03T12:00:00Z"),
        endTime: new Date("2026-01-03T13:00:00Z"),
        attendees: [],
      },
      externalGuests: [
        { email: "partner@example.com" },
        { email: "other@example.com" },
      ],
      internalTeamMembers: [{ email: "colleague@company.com" }],
      emailThreads: [{ id: "thread", messages: [reply] }],
      pastMeetings: [],
    };
    const prompt = buildPrompt(data, mockEmailAccount, []);
    expect(prompt.match(/The check now passes/g)).toHaveLength(1);
    expect(prompt).toContain("2026-01-02T12:00:00.000Z");
    expect(prompt).toContain("report.pdf");
    expect(prompt).toContain("colleague@company.com");
  });

  it("keeps attendee identities attached to each past meeting", () => {
    const context = formatMeetingForContext(
      {
        id: "past",
        title: "Weekly review",
        startTime: new Date("2026-01-02T12:00:00Z"),
        endTime: new Date("2026-01-02T13:00:00Z"),
        attendees: [
          { email: "partner@example.com", name: "Partner & Team" },
          { email: "colleague@example.org" },
        ],
      },
      null,
    );
    expect(context).toContain("partner@example.com");
    expect(context).toContain("colleague@example.org");
    expect(context).toContain("Partner &amp; Team");
  });

  it("requires one OpenRouter server web search", () => {
    const config = getWebSearchConfigForProvider("openrouter");
    const tools = config?.tools;

    expect(mockOpenRouterWebSearch).toHaveBeenCalledWith({
      engine: "auto",
      maxResults: 5,
    });
    expect(tools).toHaveProperty("web_search");
    expect(config?.providerOptions).toEqual({
      openrouter: { max_tool_calls: 1 },
    });
    expect(config?.toolChoice).toBe("required");
  });
});
