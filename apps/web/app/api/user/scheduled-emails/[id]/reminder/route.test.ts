import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import prisma from "@/utils/__mocks__/prisma";
import { DELETE } from "./route";

const authMock = vi.hoisted(() => vi.fn());
const getEmailAccountMock = vi.hoisted(() => vi.fn());

vi.mock("@/utils/auth", () => ({ auth: authMock }));
vi.mock("@/utils/redis/account-validation", () => ({
  getEmailAccount: getEmailAccountMock,
}));
vi.mock("@/utils/prisma");

const emailAccountId = "account-1";

describe("DELETE /api/user/scheduled-emails/[id]/reminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    getEmailAccountMock.mockResolvedValue("developer@example.com");
  });

  it("rejects a request without a session", async () => {
    authMock.mockResolvedValue(null);

    const response = await cancelReminder();

    expect(response.status).toBe(401);
    expect(prisma.scheduledEmail.updateMany).not.toHaveBeenCalled();
  });

  it("cancels a pending reminder", async () => {
    prisma.scheduledEmail.updateMany.mockResolvedValue({ count: 1 });

    const response = await cancelReminder();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(prisma.scheduledEmail.updateMany).toHaveBeenCalledWith({
      where: {
        id: "scheduled-1",
        emailAccountId,
        reminderStatus: "PENDING",
      },
      data: { reminderStatus: "CANCELLED" },
    });
  });

  it("rejects a reminder that is no longer pending", async () => {
    prisma.scheduledEmail.updateMany.mockResolvedValue({ count: 0 });

    const response = await cancelReminder();

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("pending"),
      isKnownError: true,
    });
  });
});

function cancelReminder() {
  return DELETE(
    new NextRequest(
      "http://127.0.0.1/api/user/scheduled-emails/scheduled-1/reminder",
      {
        method: "DELETE",
        headers: {
          cookie: "better-auth.session_token=session",
          [EMAIL_ACCOUNT_HEADER]: emailAccountId,
        },
      },
    ),
    { params: Promise.resolve({ id: "scheduled-1" }) },
  );
}
