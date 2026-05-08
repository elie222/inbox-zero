import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateSlackClient, mockPostMessage, mockJoinConversation } =
  vi.hoisted(() => ({
    mockCreateSlackClient: vi.fn(),
    mockPostMessage: vi.fn(),
    mockJoinConversation: vi.fn(),
  }));

vi.mock("./client", () => ({
  createSlackClient: mockCreateSlackClient,
}));

import {
  sendChannelConfirmation,
  sendConnectionOnboardingDirectMessage,
} from "./send";

describe("slack send helpers", () => {
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
    mockPostMessage.mockResolvedValue({ ts: "123.456" });
    mockJoinConversation.mockResolvedValue({});
  });

  it("disables link unfurls for channel confirmation messages", async () => {
    await sendChannelConfirmation({
      accessToken: "xoxb-token",
      channelId: "C123",
      botUserId: "UAPP123",
    });

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "C123",
        text: expect.stringContaining(
          "You can mention <@UAPP123> in this channel",
        ),
        unfurl_links: false,
        unfurl_media: false,
      }),
    );
  });

  it("keeps link unfurls disabled after joining a channel and retrying", async () => {
    mockPostMessage
      .mockRejectedValueOnce(
        Object.assign(new Error("not in channel"), {
          data: { error: "not_in_channel" },
        }),
      )
      .mockResolvedValueOnce({ ts: "123.456" });

    await sendChannelConfirmation({
      accessToken: "xoxb-token",
      channelId: "C123",
      botUserId: "UAPP123",
    });

    expect(mockJoinConversation).toHaveBeenCalledWith({ channel: "C123" });
    expect(mockPostMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        channel: "C123",
        unfurl_links: false,
        unfurl_media: false,
      }),
    );
  });

  it("disables link unfurls for onboarding direct messages", async () => {
    await sendConnectionOnboardingDirectMessage({
      accessToken: "xoxb-token",
      userId: "U123",
      botUserId: "UAPP123",
    });

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "U123",
        text: expect.stringContaining("invite <@UAPP123> there"),
        unfurl_links: false,
        unfurl_media: false,
      }),
    );
  });
});
