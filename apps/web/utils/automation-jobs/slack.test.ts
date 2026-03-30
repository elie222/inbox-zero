import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessagingProvider } from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";

const {
  mockCreateSlackClient,
  mockPostMessage,
  mockJoinConversation,
  mockResolveSlackDestination,
} = vi.hoisted(() => ({
  mockCreateSlackClient: vi.fn(),
  mockPostMessage: vi.fn(),
  mockJoinConversation: vi.fn(),
  mockResolveSlackDestination: vi.fn(),
}));

vi.mock("@/utils/messaging/providers/slack/client", () => ({
  createSlackClient: mockCreateSlackClient,
}));

vi.mock("@/utils/messaging/providers/slack/send", async () => {
  const actual = await vi.importActual<
    typeof import("@/utils/messaging/providers/slack/send")
  >("@/utils/messaging/providers/slack/send");

  return {
    ...actual,
    resolveSlackDestination: mockResolveSlackDestination,
  };
});

import { sendAutomationMessageToSlack } from "./slack";
import { SLACK_DM_CHANNEL_SENTINEL } from "@/utils/messaging/providers/slack/send";

const logger = createScopedLogger("automation-jobs-slack-test");

describe("sendAutomationMessageToSlack", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockCreateSlackClient.mockReturnValue({
      chat: {
        postMessage: mockPostMessage,
      },
      conversations: {
        join: mockJoinConversation,
      },
    });
    mockResolveSlackDestination.mockResolvedValue("C123");
    mockPostMessage.mockResolvedValue({ ts: "123.456" });
  });

  it("appends the mention hint when sending to a channel", async () => {
    await sendAutomationMessageToSlack({
      channel: {
        provider: MessagingProvider.SLACK,
        accessToken: "xoxb-token",
        botUserId: "UAPP123",
        providerUserId: "U123",
        channelId: "C123",
      },
      text: "You currently have 3 unread emails. Want to go through them now?",
      logger,
    });

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "C123",
        text: expect.stringContaining("_Reply with <@UAPP123>"),
      }),
    );
  });

  it("keeps direct messages unchanged", async () => {
    mockResolveSlackDestination.mockResolvedValue("D123");

    await sendAutomationMessageToSlack({
      channel: {
        provider: MessagingProvider.SLACK,
        accessToken: "xoxb-token",
        providerUserId: "U123",
        channelId: SLACK_DM_CHANNEL_SENTINEL,
      },
      text: "Your inbox looks clear right now. Want me to keep monitoring and ping again later?",
      logger,
    });

    expect(mockPostMessage).toHaveBeenCalledWith({
      channel: "D123",
      text: "Your inbox looks clear right now. Want me to keep monitoring and ping again later?",
    });
  });
});
