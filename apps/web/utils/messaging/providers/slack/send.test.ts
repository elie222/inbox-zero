import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThreadTrackerType } from "@/generated/prisma/enums";

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
  sendFollowUpReminderToSlack,
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

  it("returns the Slack timestamp for follow-up reminders", async () => {
    const result = await sendFollowUpReminderToSlack({
      accessToken: "xoxb-token",
      channelId: "C123",
      subject: "Project update",
      counterpartyName: "Alex Tester",
      counterpartyEmail: "alex@example.com",
      trackerType: ThreadTrackerType.AWAITING,
      daysSinceSent: 3,
      trackerId: "tracker-1",
    });

    expect(result).toBe("123.456");
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "C123",
        text: expect.stringContaining("Follow-up: Project update"),
        unfurl_links: false,
        unfurl_media: false,
      }),
    );
  });

  it("returns the retried Slack timestamp after joining for follow-up reminders", async () => {
    mockPostMessage
      .mockRejectedValueOnce(
        Object.assign(new Error("not in channel"), {
          data: { error: "not_in_channel" },
        }),
      )
      .mockResolvedValueOnce({ ts: "789.000" });

    const result = await sendFollowUpReminderToSlack({
      accessToken: "xoxb-token",
      channelId: "C123",
      subject: "Project update",
      counterpartyName: "Alex Tester",
      counterpartyEmail: "alex@example.com",
      trackerType: ThreadTrackerType.AWAITING,
      daysSinceSent: 3,
      trackerId: "tracker-1",
    });

    expect(result).toBe("789.000");
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

  it("returns the Slack message timestamp for follow-up reminders", async () => {
    mockPostMessage.mockResolvedValueOnce({ ts: "1700000000.000100" });

    const messageId = await sendFollowUpReminderToSlack({
      accessToken: "xoxb-token",
      channelId: "C123",
      subject: "Pricing follow-up",
      counterpartyName: "Alex Partner",
      counterpartyEmail: "alex@example.com",
      trackerType: ThreadTrackerType.AWAITING,
      daysSinceSent: 3,
      snippet: "Following up on the proposal.",
      threadLink: "https://mail.example/thread",
      trackerId: "tracker-1",
    });

    expect(messageId).toBe("1700000000.000100");
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "C123",
        text: expect.stringContaining("Pricing follow-up"),
        blocks: expect.any(Array),
        unfurl_links: false,
        unfurl_media: false,
      }),
    );
  });
});
