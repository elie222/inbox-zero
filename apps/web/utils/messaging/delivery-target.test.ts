import { describe, expect, it } from "vitest";
import { MessagingProvider } from "@/generated/prisma/enums";
import {
  getMessagingDeliveryTargetWhere,
  hasMessagingDeliveryTarget,
} from "./delivery-target";

describe("hasMessagingDeliveryTarget", () => {
  it("requires an explicit Slack destination", () => {
    expect(
      hasMessagingDeliveryTarget({
        provider: MessagingProvider.SLACK,
        providerUserId: "user-1",
        channelId: null,
      }),
    ).toBe(false);
  });

  it("accepts a Slack direct-message target after selection", () => {
    expect(
      hasMessagingDeliveryTarget({
        provider: MessagingProvider.SLACK,
        providerUserId: "user-1",
        channelId: "DM",
      }),
    ).toBe(true);
  });

  it("accepts Telegram direct-message destinations", () => {
    expect(
      hasMessagingDeliveryTarget({
        provider: MessagingProvider.TELEGRAM,
        providerUserId: "telegram-user-1",
        channelId: null,
      }),
    ).toBe(true);
  });

  it("accepts Telegram channels with a persisted DM chat id", () => {
    expect(
      hasMessagingDeliveryTarget({
        provider: MessagingProvider.TELEGRAM,
        providerUserId: null,
        teamId: "telegram-chat-1",
        channelId: null,
      }),
    ).toBe(true);
  });

  it("rejects Telegram channels without a direct-message target", () => {
    expect(
      hasMessagingDeliveryTarget({
        provider: MessagingProvider.TELEGRAM,
        providerUserId: null,
        channelId: null,
      }),
    ).toBe(false);
  });

  it("builds a provider-specific query for persisted delivery targets", () => {
    expect(getMessagingDeliveryTargetWhere()).toEqual({
      OR: [
        {
          provider: MessagingProvider.SLACK,
          channelId: { not: null },
        },
        {
          provider: MessagingProvider.TEAMS,
          providerUserId: { not: null },
        },
        {
          provider: MessagingProvider.TELEGRAM,
          OR: [{ teamId: { not: "" } }, { providerUserId: { not: null } }],
        },
      ],
    });
  });
});
