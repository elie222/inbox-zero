import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MessagingProvider,
  MessagingRouteTargetType,
} from "@/generated/prisma/enums";
import { createTestLogger } from "@/__tests__/helpers";

const {
  mockCreateSlackClient,
  mockPostMessage,
  mockJoinConversation,
  mockResolveSlackRouteDestination,
} = vi.hoisted(() => ({
  mockCreateSlackClient: vi.fn(),
  mockPostMessage: vi.fn(),
  mockJoinConversation: vi.fn(),
  mockResolveSlackRouteDestination: vi.fn(),
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
    resolveSlackRouteDestination: mockResolveSlackRouteDestination,
  };
});

import { sendAutomationMessageToSlack } from "./slack";

const logger = createTestLogger();

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
    mockResolveSlackRouteDestination.mockResolvedValue("C123");
    mockPostMessage.mockResolvedValue({ ts: "123.456" });
  });

  it("appends the mention hint when sending to a channel", async () => {
    await sendAutomationMessageToSlack({
      channel: {
        provider: MessagingProvider.SLACK,
        accessToken: "xoxb-token",
        botUserId: "UAPP123",
      },
      route: {
        targetId: "C123",
        targetType: MessagingRouteTargetType.CHANNEL,
      },
      text: "You currently have 3 unread emails. Want to go through them now?",
      logger,
    });

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "C123",
        text: expect.stringContaining("_Reply with <@UAPP123>"),
        unfurl_links: false,
        unfurl_media: false,
      }),
    );
  });

  it("keeps direct messages unchanged", async () => {
    mockResolveSlackRouteDestination.mockResolvedValue("D123");

    await sendAutomationMessageToSlack({
      channel: {
        provider: MessagingProvider.SLACK,
        accessToken: "xoxb-token",
      },
      route: {
        targetId: "U123",
        targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
      },
      text: "Your inbox looks clear right now. Want me to keep monitoring and ping again later?",
      logger,
    });

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "D123",
        text: "Your inbox looks clear right now. Want me to keep monitoring and ping again later?",
        unfurl_links: false,
        unfurl_media: false,
      }),
    );
  });
});
