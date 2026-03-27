import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  DraftMaterializationMode,
  MessagingNotificationEventType,
} from "@/generated/prisma/enums";
import { saveDraftReviewSettingsAction } from "@/utils/actions/draft-review-settings";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));

describe("saveDraftReviewSettingsAction", () => {
  const channelId = "ckchannel0000000000000000";

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "user@example.com",
      account: {
        userId: "user-1",
        provider: "google",
      },
    } as any);
    prisma.messagingChannel.findFirst.mockResolvedValue({
      id: channelId,
      channelId: "DM",
    } as any);
    prisma.messagingNotificationSubscription.upsert.mockResolvedValue({
      id: "subscription-1",
    } as any);
    prisma.emailAccount.update.mockResolvedValue({ id: "account-1" } as any);
  });

  it("enables draft review delivery for a Slack destination", async () => {
    await saveDraftReviewSettingsAction("account-1", {
      enabled: true,
      messagingChannelId: channelId,
      draftMaterializationMode: DraftMaterializationMode.MESSAGING_ONLY,
    });

    expect(
      prisma.messagingNotificationSubscription.upsert,
    ).toHaveBeenCalledWith({
      where: {
        emailAccountId_messagingChannelId_eventType: {
          emailAccountId: "account-1",
          messagingChannelId: channelId,
          eventType: MessagingNotificationEventType.OUTBOUND_PROPOSAL_READY,
        },
      },
      create: {
        emailAccountId: "account-1",
        messagingChannelId: channelId,
        eventType: MessagingNotificationEventType.OUTBOUND_PROPOSAL_READY,
        enabled: true,
      },
      update: {
        enabled: true,
      },
    });
    expect(prisma.emailAccount.update).toHaveBeenCalledWith({
      where: { id: "account-1" },
      data: {
        draftMaterializationMode: DraftMaterializationMode.MESSAGING_ONLY,
      },
    });
  });

  it("falls back to mailbox drafts when disabling messaging-only delivery", async () => {
    await saveDraftReviewSettingsAction("account-1", {
      enabled: false,
      messagingChannelId: null,
      draftMaterializationMode: DraftMaterializationMode.MESSAGING_ONLY,
    });

    expect(
      prisma.messagingNotificationSubscription.deleteMany,
    ).toHaveBeenCalledWith({
      where: {
        emailAccountId: "account-1",
        eventType: MessagingNotificationEventType.OUTBOUND_PROPOSAL_READY,
      },
    });
    expect(prisma.emailAccount.update).toHaveBeenCalledWith({
      where: { id: "account-1" },
      data: {
        draftMaterializationMode: DraftMaterializationMode.MAILBOX_DRAFT,
      },
    });
  });
});
