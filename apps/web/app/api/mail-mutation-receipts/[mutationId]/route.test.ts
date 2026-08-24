import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  mailMutationReceipt: { findUnique: vi.fn() },
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithAuthTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithAuthTestMiddleware({
    auth: { userId: "user-1" },
  });
});

vi.mock("@/utils/prisma", () => ({ default: prisma }));

import { GET } from "./route";

describe("mail mutation receipt route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("looks up the client mutation within the authenticated account", async () => {
    prisma.mailMutationReceipt.findUnique.mockResolvedValue({
      emailAccount: { account: { userId: "user-1" } },
      result: { messageId: "message-1", threadId: "thread-1" },
      status: "APPLIED",
    });

    const response = await requestReceipt("mutation-1");

    await expect(response.json()).resolves.toEqual({
      result: { messageId: "message-1", threadId: "thread-1" },
      status: "applied",
    });
    expect(prisma.mailMutationReceipt.findUnique).toHaveBeenCalledWith({
      where: {
        emailAccountId_clientMutationId: {
          clientMutationId: "mutation-1",
          emailAccountId: "account-1",
        },
      },
      select: {
        result: true,
        status: true,
        emailAccount: {
          select: { account: { select: { userId: true } } },
        },
      },
    });
  });

  it.each([
    [undefined, "missing"],
    [receipt({ status: "PROCESSING" }), "processing"],
    [receipt({ status: "UNCERTAIN" }), "uncertain"],
  ])("maps the persisted receipt to %s", async (receipt, status) => {
    prisma.mailMutationReceipt.findUnique.mockResolvedValue(receipt);

    const response = await requestReceipt("mutation-1");

    await expect(response.json()).resolves.toEqual({ status });
  });

  it("does not expose a receipt owned by another user", async () => {
    prisma.mailMutationReceipt.findUnique.mockResolvedValue(
      receipt({ ownerId: "user-2", status: "APPLIED" }),
    );

    const response = await requestReceipt("mutation-1");

    await expect(response.json()).resolves.toEqual({ status: "missing" });
  });
});

function requestReceipt(mutationId: string) {
  return GET(
    new Request(`http://localhost/api/mail-mutation-receipts/${mutationId}`, {
      headers: { "X-Email-Account-ID": "account-1" },
    }) as never,
    { params: Promise.resolve({ mutationId }) },
  );
}

function receipt({
  ownerId = "user-1",
  status,
}: {
  ownerId?: string;
  status: "APPLIED" | "PROCESSING" | "UNCERTAIN";
}) {
  return {
    emailAccount: { account: { userId: ownerId } },
    result:
      status === "APPLIED"
        ? { messageId: "message-1", threadId: "thread-1" }
        : undefined,
    status,
  };
}
