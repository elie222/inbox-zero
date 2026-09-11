import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/branding", () => ({
  toAbsoluteUrl: (path: string) => `https://app.example.com${path}`,
}));

describe("withSentMessageOpenTracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.emailAccount.findUnique.mockResolvedValue({
      sentMessageOpenTrackingEnabled: true,
    } as Awaited<ReturnType<typeof prisma.emailAccount.findUnique>>);
    prisma.sentMessageOpen.create.mockResolvedValue({
      id: "open-1",
      token: "token",
    } as Awaited<ReturnType<typeof prisma.sentMessageOpen.create>>);
  });

  it("injects a pixel and stores a token when tracking is enabled", async () => {
    const { withSentMessageOpenTracking } = await import(
      "./sent-message-open.server"
    );
    const result = await withSentMessageOpenTracking({
      emailAccountId: "account-1",
      threadId: "thread-1",
      email: { to: "a@example.com", subject: "Hi", messageHtml: "<p>Hi</p>" },
      logger: createTestLogger(),
    });

    expect(result.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(result.email.messageHtml).toContain(
      `https://app.example.com/t/${result.token}`,
    );
    expect(prisma.sentMessageOpen.create).toHaveBeenCalledWith({
      data: {
        token: result.token,
        emailAccountId: "account-1",
        threadId: "thread-1",
      },
    });
  });

  it("leaves the email unchanged when tracking is disabled", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      sentMessageOpenTrackingEnabled: false,
    } as Awaited<ReturnType<typeof prisma.emailAccount.findUnique>>);
    const { withSentMessageOpenTracking } = await import(
      "./sent-message-open.server"
    );

    const email = {
      to: "a@example.com",
      subject: "Hi",
      messageHtml: "<p>Hi</p>",
    };
    const result = await withSentMessageOpenTracking({
      emailAccountId: "account-1",
      email,
      logger: createTestLogger(),
    });

    expect(result).toEqual({ email, token: null });
    expect(prisma.sentMessageOpen.create).not.toHaveBeenCalled();
  });

  it("strips quoted tracking pixels so a reply does not re-embed the original token", async () => {
    const { withSentMessageOpenTracking } = await import(
      "./sent-message-open.server"
    );
    const quotedToken = "abcdefghijklmnopqrstuvwxyz012345";
    const result = await withSentMessageOpenTracking({
      emailAccountId: "account-1",
      email: {
        to: "a@example.com",
        subject: "Re: Hi",
        messageHtml: `<p>Thanks</p><blockquote><img src="https://app.example.com/t/${quotedToken}" width="1" height="1" /></blockquote>`,
      },
      logger: createTestLogger(),
    });

    expect(result.email.messageHtml).not.toContain(quotedToken);
    expect(result.email.messageHtml).toContain(
      `https://app.example.com/t/${result.token}`,
    );
    expect(result.email.messageHtml.match(/\/t\/[A-Za-z0-9_-]{32}/g)).toEqual([
      `/t/${result.token}`,
    ]);
  });
});

describe("recordSentMessageOpen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.sentMessageOpen.updateMany.mockResolvedValue({ count: 0 });
  });

  it("records the first open", async () => {
    prisma.sentMessageOpen.updateMany.mockResolvedValueOnce({ count: 1 });
    const { recordSentMessageOpen } = await import(
      "./sent-message-open.server"
    );

    await recordSentMessageOpen("abcdefghijklmnopqrstuvwxyz012345");

    expect(prisma.sentMessageOpen.updateMany).toHaveBeenCalledOnce();
    expect(prisma.sentMessageOpen.updateMany).toHaveBeenCalledWith({
      where: {
        token: "abcdefghijklmnopqrstuvwxyz012345",
        firstOpenedAt: null,
      },
      data: {
        firstOpenedAt: expect.any(Date),
        lastOpenedAt: expect.any(Date),
        openCount: 1,
      },
    });
  });

  it("increments later opens", async () => {
    prisma.sentMessageOpen.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    const { recordSentMessageOpen } = await import(
      "./sent-message-open.server"
    );

    await recordSentMessageOpen("abcdefghijklmnopqrstuvwxyz012345");

    expect(prisma.sentMessageOpen.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        token: "abcdefghijklmnopqrstuvwxyz012345",
        lastOpenedAt: { lt: expect.any(Date) },
      },
      data: {
        lastOpenedAt: expect.any(Date),
        openCount: { increment: 1 },
      },
    });
  });

  it("ignores invalid tokens", async () => {
    const { recordSentMessageOpen } = await import(
      "./sent-message-open.server"
    );

    await recordSentMessageOpen("nope");

    expect(prisma.sentMessageOpen.updateMany).not.toHaveBeenCalled();
  });
});

describe("sendHtmlEmailWithOpenTracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.emailAccount.findUnique.mockResolvedValue({
      sentMessageOpenTrackingEnabled: true,
    } as Awaited<ReturnType<typeof prisma.emailAccount.findUnique>>);
    prisma.sentMessageOpen.create.mockResolvedValue({
      id: "open-1",
    } as Awaited<ReturnType<typeof prisma.sentMessageOpen.create>>);
    prisma.sentMessageOpen.update.mockResolvedValue({
      id: "open-1",
    } as Awaited<ReturnType<typeof prisma.sentMessageOpen.update>>);
  });

  it("sends the tracked html and associates the provider message", async () => {
    const { sendHtmlEmailWithOpenTracking } = await import(
      "./sent-message-open.server"
    );
    const sendEmailWithHtml = vi.fn().mockResolvedValue({
      messageId: "msg-1",
      threadId: "thread-1",
    });

    const result = await sendHtmlEmailWithOpenTracking({
      emailAccountId: "account-1",
      threadId: "thread-1",
      email: { to: "a@example.com", subject: "Hi", messageHtml: "<p>Hi</p>" },
      emailProvider: { sendEmailWithHtml } as never,
      logger: createTestLogger(),
    });

    expect(result).toEqual({ messageId: "msg-1", threadId: "thread-1" });
    expect(sendEmailWithHtml).toHaveBeenCalledWith({
      to: "a@example.com",
      subject: "Hi",
      messageHtml: expect.stringContaining("https://app.example.com/t/"),
    });
    expect(prisma.sentMessageOpen.update).toHaveBeenCalledWith({
      where: { token: expect.stringMatching(/^[A-Za-z0-9_-]{32}$/) },
      data: { messageId: "msg-1", threadId: "thread-1" },
    });
  });
});
