import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  emailSendOperation: { findUnique: vi.fn() },
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

describe("email send operation route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("looks up the client mutation within the authenticated account", async () => {
    prisma.emailSendOperation.findUnique.mockResolvedValue({
      emailAccount: { account: { userId: "user-1" } },
      result: { messageId: "message-1", threadId: "thread-1" },
      status: "SENT",
    });

    const response = await requestOperation("mutation-1");

    await expect(response.json()).resolves.toEqual({
      result: { messageId: "message-1", threadId: "thread-1" },
      status: "sent",
    });
    expect(prisma.emailSendOperation.findUnique).toHaveBeenCalledWith({
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
    [operation({ status: "PROCESSING" }), "processing"],
    [operation({ status: "UNCERTAIN" }), "uncertain"],
  ])("maps the persisted operation to %s", async (operation, status) => {
    prisma.emailSendOperation.findUnique.mockResolvedValue(operation);

    const response = await requestOperation("mutation-1");

    await expect(response.json()).resolves.toEqual({ status });
  });

  it("does not expose an operation owned by another user", async () => {
    prisma.emailSendOperation.findUnique.mockResolvedValue(
      operation({ ownerId: "user-2", status: "SENT" }),
    );

    const response = await requestOperation("mutation-1");

    await expect(response.json()).resolves.toEqual({ status: "missing" });
  });
});

function requestOperation(mutationId: string) {
  return GET(
    new Request(`http://localhost/api/email-send-operations/${mutationId}`, {
      headers: { "X-Email-Account-ID": "account-1" },
    }) as never,
    { params: Promise.resolve({ mutationId }) },
  );
}

function operation({
  ownerId = "user-1",
  status,
}: {
  ownerId?: string;
  status: "SENT" | "PROCESSING" | "UNCERTAIN";
}) {
  return {
    emailAccount: { account: { userId: ownerId } },
    result:
      status === "SENT"
        ? { messageId: "message-1", threadId: "thread-1" }
        : undefined,
    status,
  };
}
