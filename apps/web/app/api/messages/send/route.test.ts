import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const executeDurableEmailSend = vi.hoisted(() => vi.fn());
const emailProvider = vi.hoisted(() => ({
  name: "google" as const,
  sendEmailWithHtml: vi.fn(),
}));

type MockedRequest = NextRequest & {
  auth: { emailAccountId: string };
  emailProvider: typeof emailProvider;
  logger: { error: () => void };
};

vi.mock("@/utils/email/durable-email-send", () => ({
  executeDurableEmailSend,
}));

vi.mock("@/utils/middleware", () => ({
  withEmailProvider:
    (_name: string, handler: (request: MockedRequest) => Promise<Response>) =>
    (request: NextRequest) =>
      handler(
        Object.assign(request, {
          auth: { emailAccountId: "account-1" },
          emailProvider,
          logger: { error: vi.fn() },
        }) as MockedRequest,
      ),
}));

describe("POST /api/messages/send", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps accepting the legacy direct-send payload", async () => {
    emailProvider.sendEmailWithHtml.mockResolvedValue({
      messageId: "message-1",
      threadId: "thread-1",
    });

    const response = await post({
      to: "recipient@example.com",
      subject: "Hello",
      messageHtml: "<p>Hello</p>",
    });

    await expect(response.json()).resolves.toEqual({
      success: true,
      messageId: "message-1",
      threadId: "thread-1",
    });
    expect(emailProvider.sendEmailWithHtml).toHaveBeenCalledOnce();
    expect(executeDurableEmailSend).not.toHaveBeenCalled();
  });

  it("routes mutation-wrapped sends through the durable operation", async () => {
    executeDurableEmailSend.mockResolvedValue({
      status: "applied",
      result: { messageId: "message-1", threadId: "thread-1" },
    });
    const input = {
      mutationId: "41ec6d2b-d0e8-4f75-924a-f6f4e5bab4cf",
      queuedAt: 1_788_000_000_000,
      threadId: "thread-1",
      messageIds: ["message-1"],
      email: {
        to: "recipient@example.com",
        subject: "Re: Hello",
        messageHtml: "<p>Reply</p>",
      },
    };

    const response = await post(input);

    await expect(response.json()).resolves.toEqual({
      status: "applied",
      result: { messageId: "message-1", threadId: "thread-1" },
    });
    expect(executeDurableEmailSend).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      getEmailProvider: expect.any(Function),
      input,
      provider: "google",
    });
    await expect(
      executeDurableEmailSend.mock.calls[0][0].getEmailProvider(),
    ).resolves.toBe(emailProvider);
    expect(emailProvider.sendEmailWithHtml).not.toHaveBeenCalled();
  });

  it("does not treat an invalid mutation wrapper as a legacy payload", async () => {
    await expect(
      post({
        mutationId: "not-a-uuid",
        to: "recipient@example.com",
        subject: "Hello",
        messageHtml: "<p>Hello</p>",
      }),
    ).rejects.toThrow();
    expect(emailProvider.sendEmailWithHtml).not.toHaveBeenCalled();
    expect(executeDurableEmailSend).not.toHaveBeenCalled();
  });

  it("rejects durable sends without a message to reconcile", async () => {
    await expect(
      post({
        mutationId: "41ec6d2b-d0e8-4f75-924a-f6f4e5bab4cf",
        queuedAt: 1_788_000_000_000,
        threadId: "thread-1",
        messageIds: [],
        email: {
          to: "recipient@example.com",
          subject: "Re: Hello",
          messageHtml: "<p>Reply</p>",
        },
      }),
    ).rejects.toThrow();
    expect(executeDurableEmailSend).not.toHaveBeenCalled();
  });
});

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/messages/send", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );
}
