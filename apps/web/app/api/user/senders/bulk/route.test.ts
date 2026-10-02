import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { NewsletterStatus } from "@/generated/prisma/enums";
import { BULK_SENDER_ACTION_LIMIT } from "@/utils/actions/unsubscriber.validation";

const { mockHasAccess, mockApply, mockEmailProvider } = vi.hoisted(() => ({
  mockHasAccess: vi.fn(),
  mockApply: vi.fn(),
  mockEmailProvider: { name: "google" },
}));

vi.mock("@/utils/premium/unsubscribe-credits", () => ({
  userHasUnsubscribeAccess: mockHasAccess,
}));
vi.mock("@/utils/senders/bulk-actions", async () => {
  const actual = await vi.importActual<
    typeof import("@/utils/senders/bulk-actions")
  >("@/utils/senders/bulk-actions");
  return {
    ...actual,
    applySenderBulkActions: mockApply,
  };
});
vi.mock("@/utils/middleware", async () => {
  const { createWithEmailProviderTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithEmailProviderTestMiddleware(mockEmailProvider);
});

import { POST } from "./route";

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/user/senders/bulk", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    {} as never,
  );
}

describe("POST /api/user/senders/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasAccess.mockResolvedValue(true);
    mockApply.mockResolvedValue([
      {
        senderEmail: "news@example.com",
        ok: true,
        status: NewsletterStatus.UNSUBSCRIBED,
      },
    ]);
  });

  it("returns one result per action", async () => {
    const response = await post({
      actions: [
        { senderEmail: "news@example.com", action: "unsubscribe" },
        { senderEmail: "ok@example.com", action: "approved" },
      ],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: [
        {
          senderEmail: "news@example.com",
          ok: true,
          status: NewsletterStatus.UNSUBSCRIBED,
        },
      ],
    });
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "email-account-1",
        userId: "user-1",
        actions: [
          { senderEmail: "news@example.com", action: "unsubscribe" },
          { senderEmail: "ok@example.com", action: "approved" },
        ],
      }),
    );
  });

  it("rejects a credit-consuming batch when the allowance is used up", async () => {
    mockHasAccess.mockResolvedValue(false);

    const response = await post({
      actions: [{ senderEmail: "news@example.com", action: "auto_archived" }],
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      errorCode: "unsubscribe_allowance",
    });
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("still approves senders when the user has no unsubscribe allowance", async () => {
    mockHasAccess.mockResolvedValue(false);
    mockApply.mockResolvedValue([
      {
        senderEmail: "ok@example.com",
        ok: true,
        status: NewsletterStatus.APPROVED,
      },
    ]);

    const response = await post({
      actions: [{ senderEmail: "ok@example.com", action: "approved" }],
    });

    expect(response.status).toBe(200);
    expect(mockHasAccess).not.toHaveBeenCalled();
    expect(mockApply).toHaveBeenCalled();
  });

  it("rejects a batch over the action limit", async () => {
    const actions = Array.from(
      { length: BULK_SENDER_ACTION_LIMIT + 1 },
      (_, index) => ({
        senderEmail: `sender-${index}@example.com`,
        action: "clear" as const,
      }),
    );

    await expect(post({ actions })).rejects.toBeInstanceOf(ZodError);
    expect(mockApply).not.toHaveBeenCalled();
  });
});
