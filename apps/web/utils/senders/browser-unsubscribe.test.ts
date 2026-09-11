import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import { getMockParsedMessage } from "@/__tests__/mocks/email-provider.mock";
import { browserUnsubscribe } from "./browser-unsubscribe";

const { getMessagesFromSender, fetchMock } = vi.hoisted(() => ({
  getMessagesFromSender: vi.fn(),
  fetchMock: vi.fn(),
}));
vi.mock("@/utils/prisma");
vi.mock("@/env", () => ({
  env: {
    UNSUBSCRIBE_WORKER_URL: "https://worker.example.com",
    UNSUBSCRIBE_WORKER_SECRET: "test-secret-with-at-least-32-characters",
  },
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn().mockResolvedValue({ getMessagesFromSender }),
}));

describe("browser unsubscribe", () => {
  const logger = createTestLogger();
  const options = {
    emailAccountId: "account-1",
    senderEmail: "sender@example.com",
    logger,
  };
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    prisma.emailAccount.findUniqueOrThrow.mockResolvedValue({
      email: "owner@example.com",
      account: { provider: "google" },
    } as any);
    const message = getMockParsedMessage();
    getMessagesFromSender.mockResolvedValue({
      messages: [
        {
          ...message,
          headers: {
            ...message.headers,
            from: "Sender <sender@example.com>",
            "list-unsubscribe": "<https://example.com/unsubscribe?token=owned>",
          },
        },
      ],
    });
    fetchMock.mockImplementation(async (_url, init) =>
      Response.json({
        jobId: JSON.parse(init.body).jobId,
        status: "confirmed",
      }),
    );
  });

  it("uses the selected account's message link and recipient, without passing account credentials", async () => {
    expect(await browserUnsubscribe(options)).toMatchObject({
      success: true,
      method: "browser",
    });
    expect(prisma.emailAccount.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "account-1" } }),
    );
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload).toEqual({
      jobId: expect.any(String),
      url: "https://example.com/unsubscribe?token=owned",
      recipientEmail: "owner@example.com",
    });
  });

  it("rejects a response belonging to another job", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        jobId: "b6240390-9360-4c4d-a5e0-e4717b357ca4",
        status: "confirmed",
      }),
    );
    expect(await browserUnsubscribe(options)).toMatchObject({ success: false });
  });

  it("does not use a message from a different sender returned by search", async () => {
    getMessagesFromSender.mockResolvedValue({
      messages: [
        getMockParsedMessage({
          headers: {
            ...getMockParsedMessage().headers,
            from: "other@example.com",
            "list-unsubscribe": "<https://example.com/unsubscribe>",
          },
        }),
      ],
    });
    expect(await browserUnsubscribe(options)).toMatchObject({
      attempted: false,
      success: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves blocked or ambiguous flows unsuccessful", async () => {
    fetchMock.mockImplementation(async (_url, init) =>
      Response.json({
        jobId: JSON.parse(init.body).jobId,
        status: "needs_user",
      }),
    );
    expect(await browserUnsubscribe(options)).toMatchObject({
      success: false,
      reason: "needs_user",
    });
  });
});
