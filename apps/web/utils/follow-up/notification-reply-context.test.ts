import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { MessagingProvider } from "@/generated/prisma/enums";
import { followUpNotificationDeliverySchema } from "@/utils/follow-up/notification-deliveries";
import { getFollowUpNotificationReplyContext } from "@/utils/follow-up/notification-reply-context";

vi.mock("@/utils/prisma");

describe("getFollowUpNotificationReplyContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the referenced email for a tracker whose stored delivery matches the notification message", async () => {
    prisma.threadTracker.findFirst.mockResolvedValue({
      emailAccountId: "email-account-1",
      threadId: "thread-abc",
      messageId: "message-xyz",
    } as any);

    const result = await getFollowUpNotificationReplyContext({
      provider: MessagingProvider.SLACK,
      providerThreadId: "C123",
      providerMessageId: "1700000000.000100",
      emailAccountIds: ["email-account-1", "email-account-2"],
    });

    expect(result).toEqual({
      emailAccountId: "email-account-1",
      threadId: "thread-abc",
      messageId: "message-xyz",
    });
  });

  it("scopes the lookup to the candidate email accounts and the stored delivery shape", async () => {
    prisma.threadTracker.findFirst.mockResolvedValue(null);

    await getFollowUpNotificationReplyContext({
      provider: MessagingProvider.TELEGRAM,
      providerThreadId: "telegram:12345",
      providerMessageId: "12345:67",
      emailAccountIds: ["email-account-1"],
    });

    const where = prisma.threadTracker.findFirst.mock.calls[0][0]?.where;
    expect(where?.emailAccountId).toEqual({ in: ["email-account-1"] });

    // The JSON filter must stay a subset of the persisted delivery shape,
    // otherwise the containment query silently stops matching.
    const arrayContains = (where?.followUpNotifications as any)
      ?.array_contains as unknown[];
    expect(arrayContains).toHaveLength(1);
    const persistedDelivery = followUpNotificationDeliverySchema.parse({
      messagingChannelId: "mc-1",
      provider: MessagingProvider.TELEGRAM,
      providerThreadId: "telegram:12345",
      providerMessageId: "12345:67",
    });
    expect(persistedDelivery).toMatchObject(arrayContains[0] as object);
  });

  it("returns null when no tracker matches", async () => {
    prisma.threadTracker.findFirst.mockResolvedValue(null);

    const result = await getFollowUpNotificationReplyContext({
      provider: MessagingProvider.SLACK,
      providerThreadId: "C123",
      providerMessageId: "1700000000.000100",
      emailAccountIds: ["email-account-1"],
    });

    expect(result).toBeNull();
  });

  it("returns null without querying when there are no candidate accounts", async () => {
    const result = await getFollowUpNotificationReplyContext({
      provider: MessagingProvider.SLACK,
      providerThreadId: "C123",
      providerMessageId: "1700000000.000100",
      emailAccountIds: [],
    });

    expect(result).toBeNull();
    expect(prisma.threadTracker.findFirst).not.toHaveBeenCalled();
  });
});
