import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import prisma from "@/utils/__mocks__/prisma";
import { POST } from "./route";

const authMock = vi.hoisted(() => vi.fn());
const getEmailAccountMock = vi.hoisted(() => vi.fn());

vi.mock("@/utils/auth", () => ({ auth: authMock }));
vi.mock("@/utils/redis/account-validation", () => ({
  getEmailAccount: getEmailAccountMock,
}));
vi.mock("@/utils/prisma");

const emailAccountId = "account-1";
const updatedAt = new Date("2026-09-01T00:00:00.000Z");

describe("POST /api/user/scheduled-emails/[id]/retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    getEmailAccountMock.mockResolvedValue("developer@example.com");
  });

  it("rejects a request without a session", async () => {
    authMock.mockResolvedValue(null);

    const response = await retry();

    expect(response.status).toBe(401);
    expect(prisma.scheduledEmail.updateMany).not.toHaveBeenCalled();
  });

  it("requeues a failed send that has no durable operation", async () => {
    prisma.scheduledEmail.findUnique.mockResolvedValue({
      id: "scheduled-1",
      emailAccountId,
      status: "FAILED",
      updatedAt,
      clientMutationId: "827f1b38-2032-4bfd-bc2c-cbba02746b04",
    } as never);
    prisma.emailSendOperation.findUnique.mockResolvedValue(null);
    prisma.scheduledEmail.updateMany.mockResolvedValue({ count: 1 });

    const response = await retry();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(prisma.scheduledEmail.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "scheduled-1",
          emailAccountId,
          updatedAt,
          status: "FAILED",
        },
        data: expect.objectContaining({ status: "PENDING", error: null }),
      }),
    );
  });

  it("rejects a send that is not safe to retry", async () => {
    prisma.scheduledEmail.findUnique.mockResolvedValue({
      id: "scheduled-1",
      status: "PENDING",
      updatedAt,
    } as never);

    const response = await retry();

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("safely"),
      isKnownError: true,
    });
    expect(prisma.scheduledEmail.updateMany).not.toHaveBeenCalled();
  });
});

function retry() {
  return POST(
    new NextRequest(
      "http://127.0.0.1/api/user/scheduled-emails/scheduled-1/retry",
      {
        method: "POST",
        headers: {
          cookie: "better-auth.session_token=session",
          [EMAIL_ACCOUNT_HEADER]: emailAccountId,
        },
      },
    ),
    { params: Promise.resolve({ id: "scheduled-1" }) },
  );
}
