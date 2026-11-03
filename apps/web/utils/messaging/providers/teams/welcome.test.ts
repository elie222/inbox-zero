import { createMemoryState } from "@chat-adapter/state-memory";
import { cardToAdaptiveCard, decodeThreadId } from "@chat-adapter/teams";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMessagingChatSdkBot } from "@/utils/messaging/chat-sdk/bot";
import { sendTeamsInstallationWelcome } from "./welcome";

vi.mock("@/utils/messaging/chat-sdk/bot", () => ({
  getMessagingChatSdkBot: vi.fn(),
}));

const postMessage = vi.fn();
const activity = {
  id: "install-event",
  type: "installationUpdate",
  action: "add",
  channelId: "msteams",
  serviceUrl: "https://smba.trafficmanager.net/teams/",
  conversation: { id: "personal-conversation", conversationType: "personal" },
};

beforeEach(async () => {
  vi.clearAllMocks();
  const state = createMemoryState();
  await state.connect();
  vi.mocked(getMessagingChatSdkBot).mockReturnValue({
    bot: { getState: () => state },
    adapters: { teams: { postMessage } },
  } as unknown as ReturnType<typeof getMessagingChatSdkBot>);
  postMessage.mockResolvedValue({ id: "welcome" });
});

afterEach(() => vi.useRealTimers());

describe("sendTeamsInstallationWelcome", () => {
  it("welcomes a personal install once and preserves setup commands and contact details", async () => {
    await sendTeamsInstallationWelcome(activity);
    await sendTeamsInstallationWelcome(activity);

    expect(postMessage).toHaveBeenCalledTimes(1);
    const [threadId, card] = postMessage.mock.calls[0];
    expect(decodeThreadId(threadId)).toMatchObject({
      conversationId: activity.conversation.id,
      serviceUrl: activity.serviceUrl,
    });
    const rendered = JSON.stringify(cardToAdaptiveCard(card));
    expect(rendered).toContain("/connect <code>");
    expect(rendered).toContain("/docs/essentials/channels");
    expect(rendered).toContain("support@");
  });

  it.each([
    null,
    {},
    { ...activity, type: "message" },
    { ...activity, action: "remove" },
    { ...activity, action: "add-upgrade" },
    { ...activity, channelId: "other" },
    {
      ...activity,
      conversation: { id: "channel", conversationType: "channel" },
    },
  ])("ignores activities that are not new personal installs: %j", async (input) => {
    await sendTeamsInstallationWelcome(input);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("recovers an interrupted delivery after its short claim expires", async () => {
    vi.useFakeTimers();
    const state = getMessagingChatSdkBot().bot.getState();
    await state.acquireLock(
      "teams:welcome:personal-conversation:install-event",
      15_000,
    );
    await expect(sendTeamsInstallationWelcome(activity)).rejects.toThrow(
      "already in progress",
    );
    expect(postMessage).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(15_001);
    await sendTeamsInstallationWelcome(activity);
    await sendTeamsInstallationWelcome(activity);
    expect(postMessage).toHaveBeenCalledTimes(1);
  });

  it("allows a failed delivery to be retried", async () => {
    postMessage.mockRejectedValueOnce(new Error("Delivery failed"));
    await expect(sendTeamsInstallationWelcome(activity)).rejects.toThrow(
      "Delivery failed",
    );
    await sendTeamsInstallationWelcome(activity);
    expect(postMessage).toHaveBeenCalledTimes(2);
  });
});
