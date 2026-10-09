import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger, getRule } from "@/__tests__/helpers";
import { getMockParsedMessage } from "@/__tests__/mocks/email-provider.mock";
import { ExecutedRuleStatus, SystemType } from "@/generated/prisma/enums";
import { sendMobilePushNotification } from "@/utils/mobile-push";
import { sendToReplyPushNotification } from "./to-reply-push";

vi.mock("@/utils/mobile-push", () => ({
  sendMobilePushNotification: vi.fn().mockResolvedValue(undefined),
}));
const logger = createTestLogger();
const now = new Date("2026-10-09T12:00:00Z");
const options = {
  emailAccountId: "account-1",
  userId: "user-1",
  logger,
  now,
  message: getMockParsedMessage({
    id: "message-1",
    threadId: "thread-1",
    internalDate: String(now.getTime() - 60_000),
    subject: "",
    headers: {
      from: "<alex@example.com>",
      to: "user@example.com",
      subject: "",
      date: now.toISOString(),
    },
  }),
  results: [
    {
      rule: { ...getRule("Reply needed"), systemType: SystemType.TO_REPLY },
      status: ExecutedRuleStatus.APPLIED,
      createdAt: now,
    },
  ],
};

describe("sendToReplyPushNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sendMobilePushNotification).mockResolvedValue(undefined);
  });

  it("uses the sender address and no-subject fallback and sends once for multiple results", async () => {
    await sendToReplyPushNotification({
      ...options,
      results: [...options.results, ...options.results],
    });
    expect(sendMobilePushNotification).toHaveBeenCalledExactlyOnceWith({
      userId: "user-1",
      deduplicationKey: "to-reply:account-1:message-1",
      logger,
      notification: {
        title: "alex@example.com",
        body: "(no subject)",
        sound: "default",
        data: {
          threadId: "thread-1",
          emailAccountId: "account-1",
          messageId: "message-1",
          type: "to_reply",
        },
      },
    });
  });

  it("falls back to the address for an empty quoted display name", async () => {
    await sendToReplyPushNotification({
      ...options,
      message: {
        ...options.message,
        headers: { ...options.message.headers, from: '"" <alex@example.com>' },
      },
    });
    expect(sendMobilePushNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        notification: expect.objectContaining({ title: "alex@example.com" }),
      }),
    );
  });

  it.each([
    "old",
    "future",
    "invalid",
  ])("ignores %s timestamps", async (kind) => {
    const timestamp =
      kind === "old" ? now.getTime() - 16 * 60_000 : now.getTime() + 60_000;
    await sendToReplyPushNotification({
      ...options,
      message: {
        ...options.message,
        internalDate: kind === "invalid" ? "invalid" : String(timestamp),
        date: "invalid",
      },
    });
    expect(sendMobilePushNotification).not.toHaveBeenCalled();
  });

  it("uses the date fallback when the provider timestamp is absent", async () => {
    await sendToReplyPushNotification({
      ...options,
      message: {
        ...options.message,
        internalDate: undefined,
        date: now.toISOString(),
      },
    });
    expect(sendMobilePushNotification).toHaveBeenCalledOnce();
  });

  it("does not send without a provider thread id", async () => {
    await sendToReplyPushNotification({
      ...options,
      message: { ...options.message, threadId: "" },
    });
    expect(sendMobilePushNotification).not.toHaveBeenCalled();
  });

  it("ignores an existing To Reply result", async () => {
    await sendToReplyPushNotification({
      ...options,
      results: [{ ...options.results[0], existing: true }],
    });
    expect(sendMobilePushNotification).not.toHaveBeenCalled();
  });

  it("bounds long notification content", async () => {
    await sendToReplyPushNotification({
      ...options,
      message: {
        ...options.message,
        subject: "S".repeat(1000),
        headers: {
          ...options.message.headers,
          from: `${"N".repeat(1000)} <alex@example.com>`,
        },
      },
    });
    const { notification } = vi.mocked(sendMobilePushNotification).mock
      .calls[0][0];
    expect(notification.title.length).toBeLessThanOrEqual(103);
    expect(notification.body.length).toBeLessThanOrEqual(203);
  });

  it("contains push failures", async () => {
    vi.mocked(sendMobilePushNotification).mockRejectedValue(
      new Error("Push unavailable"),
    );
    await expect(sendToReplyPushNotification(options)).resolves.toBeUndefined();
    expect(sendMobilePushNotification).toHaveBeenCalledOnce();
  });
});
