import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewsletterStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";

const { mockUnsubscribe, mockSource, mockCreateProvider } = vi.hoisted(() => ({
  mockUnsubscribe: vi.fn(),
  mockSource: vi.fn(),
  mockCreateProvider: vi.fn(),
}));

vi.mock("@/utils/prisma");
vi.mock("@/utils/senders/unsubscribe", () => ({
  unsubscribeSenderAndMark: mockUnsubscribe,
}));
vi.mock("@/utils/senders/source", () => ({
  getSenderUnsubscribeSource: mockSource,
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: mockCreateProvider,
}));
vi.mock("@/utils/middleware", async () => {
  const { createWithEmailAccountTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithEmailAccountTestMiddleware();
});

import { POST } from "./route";

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/user/senders/unsubscribe", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    {} as never,
  );
}

describe("POST /api/user/senders/unsubscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUnsubscribe.mockResolvedValue({
      senderEmail: "news@example.com",
      status: NewsletterStatus.UNSUBSCRIBED,
      unsubscribe: { attempted: true, success: true, method: "post" },
    });
    mockSource.mockResolvedValue({
      listUnsubscribeHeader: "<https://example.com/one-click>",
      unsubscribeLink: "https://example.com/unsub",
    });
    mockCreateProvider.mockResolvedValue({ name: "google" });
    prisma.emailAccount.findUnique.mockResolvedValue({
      account: { provider: "google" },
    } as never);
  });

  it("uses a client-supplied link without looking the sender up", async () => {
    const response = await post({
      senderEmail: "news@example.com",
      unsubscribeLink: "https://example.com/given",
    });

    expect(response.status).toBe(200);
    expect(mockSource).not.toHaveBeenCalled();
    expect(mockCreateProvider).not.toHaveBeenCalled();
    expect(mockUnsubscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        senderEmail: "news@example.com",
        unsubscribeLink: "https://example.com/given",
      }),
    );
  });

  it("resolves the unsubscribe source when only the sender is sent", async () => {
    await post({ senderEmail: "news@example.com" });

    expect(mockCreateProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "email-account-1",
        provider: "google",
      }),
    );
    expect(mockSource).toHaveBeenCalledWith(
      expect.objectContaining({ senderEmail: "news@example.com" }),
    );
    expect(mockUnsubscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        unsubscribeLink: "https://example.com/unsub",
        listUnsubscribeHeader: "<https://example.com/one-click>",
      }),
    );
  });

  it("does not unsubscribe when resolving the omitted source fails", async () => {
    mockSource.mockRejectedValue(new Error("lookup failed"));

    await expect(post({ senderEmail: "news@example.com" })).rejects.toThrow(
      "lookup failed",
    );
    expect(mockUnsubscribe).not.toHaveBeenCalled();
  });

  it("leaves the sender unchanged when the unsubscribe does not succeed", async () => {
    mockUnsubscribe.mockResolvedValue({
      senderEmail: "news@example.com",
      status: null,
      unsubscribe: {
        attempted: false,
        success: false,
        reason: "no_unsubscribe_url",
      },
    });

    const response = await post({ senderEmail: "news@example.com" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: null,
      unsubscribe: { success: false, reason: "no_unsubscribe_url" },
    });
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/user/senders/unsubscribe", {
        method: "POST",
        body: "{",
      }),
      {} as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid JSON body",
      isKnownError: true,
    });
    expect(mockUnsubscribe).not.toHaveBeenCalled();
    expect(mockSource).not.toHaveBeenCalled();
  });
});
