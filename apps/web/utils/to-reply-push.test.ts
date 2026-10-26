import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger, getRule } from "@/__tests__/helpers";
import { getMockParsedMessage } from "@/__tests__/mocks/email-provider.mock";
import { ExecutedRuleStatus, SystemType } from "@/generated/prisma/enums";
import { sendMobilePushNotification } from "@/utils/mobile-push";
import { sendToReplyPushNotification } from "./to-reply-push";

vi.mock("server-only", () => ({}));

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
    textHtml: "",
    textPlain: "",
    snippet: "",
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

  it.each([
    {
      textPlain: "  Please\t review\n\n the plan.  ",
      textHtml: "",
      snippet: "",
    },
    {
      textHtml: "<p>Please review&nbsp; the plan.</p>",
      textPlain: "",
      snippet: "",
    },
    { snippet: "Please review&nbsp; the plan.", textHtml: "", textPlain: "" },
    {
      textPlain:
        "Please review the plan.\n\nOn Mon, Oct 19, 2026, Alex <alex@example.com> wrote:\n> Earlier message.",
      textHtml: "",
      snippet: "",
    },
  ])("sends a plain preview from the existing message: %j", async (content) => {
    await sendToReplyPushNotification({
      ...options,
      message: {
        ...options.message,
        ...content,
        subject: "  Project plan  ",
        headers: {
          ...options.message.headers,
          from: "Alex <alex@example.com>",
        },
      },
    });
    const { notification } = vi.mocked(sendMobilePushNotification).mock
      .calls[0][0];
    expect(notification).toEqual({
      title: "Alex",
      subtitle: "Project plan",
      body: "Please review the plan.",
      sound: "default",
      data: {
        threadId: "thread-1",
        emailAccountId: "account-1",
        messageId: "message-1",
        type: "to_reply",
      },
    });
  });

  it("keeps the subject as the body when the preview is whitespace only", async () => {
    await sendToReplyPushNotification({
      ...options,
      message: {
        ...options.message,
        subject: "Project plan",
        textPlain: " \t\n ",
      },
    });
    const { notification } = vi.mocked(sendMobilePushNotification).mock
      .calls[0][0];
    expect(notification.body).toBe("Project plan");
    expect(notification).not.toHaveProperty("subtitle");
  });

  it("uses the no-subject fallback as the subtitle when there is a preview", async () => {
    await sendToReplyPushNotification({
      ...options,
      message: { ...options.message, textPlain: "Please review the plan." },
    });
    const { notification } = vi.mocked(sendMobilePushNotification).mock
      .calls[0][0];
    expect(notification).toMatchObject({
      subtitle: "(no subject)",
      body: "Please review the plan.",
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

  it("does not alert for a skipped To Reply result", async () => {
    await sendToReplyPushNotification({
      ...options,
      results: [{ ...options.results[0], status: ExecutedRuleStatus.SKIPPED }],
    });
    expect(sendMobilePushNotification).not.toHaveBeenCalled();
  });

  it.each([
    ExecutedRuleStatus.APPLYING,
    ExecutedRuleStatus.ERROR,
  ])("alerts when To Reply is classified but action status is %s", async (status) => {
    await sendToReplyPushNotification({
      ...options,
      results: [{ ...options.results[0], status }],
    });
    expect(sendMobilePushNotification).toHaveBeenCalledOnce();
  });

  it("bounds long notification content", async () => {
    await sendToReplyPushNotification({
      ...options,
      message: {
        ...options.message,
        subject: "S".repeat(1000),
        textPlain: "Preview ".repeat(200),
        headers: {
          ...options.message.headers,
          from: `${"N".repeat(1000)} <alex@example.com>`,
        },
      },
    });
    const { notification } = vi.mocked(sendMobilePushNotification).mock
      .calls[0][0];
    expect(notification.title.length).toBeLessThanOrEqual(103);
    expect(notification.subtitle?.length).toBeLessThanOrEqual(203);
    expect(notification.body.length).toBe(203);
    expect(notification.body).toMatch(/^Preview .*\.\.\.$/);
  });

  it("contains push failures", async () => {
    vi.mocked(sendMobilePushNotification).mockRejectedValue(
      new Error("Push unavailable"),
    );
    await expect(sendToReplyPushNotification(options)).resolves.toBeUndefined();
    expect(sendMobilePushNotification).toHaveBeenCalledOnce();
  });
});
