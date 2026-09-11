import { describe, expect, it } from "vitest";
import { ActionType, MessagingProvider } from "@/generated/prisma/enums";
import { getActionDisplay } from "@/utils/action-display";

describe("getActionDisplay", () => {
  it.each([
    [MessagingProvider.SLACK, "Notify on Slack"],
    [MessagingProvider.TEAMS, "Notify on Teams"],
    [MessagingProvider.TELEGRAM, "Notify on Telegram"],
  ])("shows the notification provider for %s", (provider, expected) => {
    expect(
      getActionDisplay(
        {
          type: ActionType.NOTIFY_MESSAGING_CHANNEL,
          messagingChannel: { provider },
        },
        "gmail",
        [],
      ),
    ).toBe(expected);
  });

  it("keeps a generic fallback when the messaging channel is missing", () => {
    expect(
      getActionDisplay(
        { type: ActionType.NOTIFY_MESSAGING_CHANNEL },
        "gmail",
        [],
      ),
    ).toBe("Notify");
  });
});
