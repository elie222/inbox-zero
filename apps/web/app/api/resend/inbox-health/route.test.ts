import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { Frequency } from "@/generated/prisma/enums";

vi.mock("@/utils/prisma");

const { mockCreateEmailProvider, mockIsAuthorizedCronOrInternalRequest } =
  vi.hoisted(() => ({
    mockCreateEmailProvider: vi.fn(),
    mockIsAuthorizedCronOrInternalRequest: vi.fn(),
  }));

vi.mock("@/utils/middleware", async () => {
  const {
    createWithEmailAccountTestMiddleware,
    createWithErrorTestMiddleware,
  } = await vi.importActual<typeof import("@/__tests__/helpers")>(
    "@/__tests__/helpers",
  );

  return {
    ...createWithErrorTestMiddleware(),
    ...createWithEmailAccountTestMiddleware({
      auth: {
        email: "user@example.com",
        emailAccountId: "email-account-id",
        userId: "user-id",
      },
    }),
  };
});

vi.mock("@/utils/cron", () => ({
  isAuthorizedCronOrInternalRequest: (...args: unknown[]) =>
    mockIsAuthorizedCronOrInternalRequest(...args),
}));

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: (...args: unknown[]) => mockCreateEmailProvider(...args),
}));

vi.mock("@inboxzero/resend", () => ({
  sendInboxHealthEmail: vi.fn(),
}));

import { POST } from "./route";

const emailAccount = {
  userId: "user-id",
  email: "user@example.com",
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  statsEmailFrequency: Frequency.MONTHLY,
  lastInboxHealthEmailAt: null,
  account: {
    provider: "google",
    refresh_token: "refresh-token",
  },
};

describe("inbox health email route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthorizedCronOrInternalRequest.mockReturnValue(true);
    prisma.emailAccount.findUnique.mockResolvedValue(emailAccount as any);
    prisma.emailAccount.update.mockResolvedValue({} as any);
  });

  it("defers accounts without a refresh token instead of calling the provider", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      ...emailAccount,
      account: { ...emailAccount.account, refresh_token: null },
    } as any);

    const response = await POST(
      new NextRequest("http://localhost:3000/api/resend/inbox-health", {
        method: "POST",
        body: JSON.stringify({ emailAccountId: "email-account-id" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockCreateEmailProvider).not.toHaveBeenCalled();
    expect(prisma.emailAccount.update).toHaveBeenCalledWith({
      where: { id: "email-account-id" },
      data: { lastInboxHealthEmailAt: expect.any(Date) },
    });
  });

  it("acknowledges permanent provider failures and defers future sends", async () => {
    mockCreateEmailProvider.mockRejectedValue(new Error("invalid_grant"));

    const response = await POST(
      new NextRequest("http://localhost:3000/api/resend/inbox-health", {
        method: "POST",
        body: JSON.stringify({ emailAccountId: "email-account-id" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(prisma.emailAccount.update).toHaveBeenCalledWith({
      where: { id: "email-account-id" },
      data: { lastInboxHealthEmailAt: expect.any(Date) },
    });
  });

  it("keeps transient provider failures retryable", async () => {
    mockCreateEmailProvider.mockRejectedValue(new Error("Temporary outage"));

    const response = await POST(
      new NextRequest("http://localhost:3000/api/resend/inbox-health", {
        method: "POST",
        body: JSON.stringify({ emailAccountId: "email-account-id" }),
      }),
    );

    expect(response.status).toBe(500);
    expect(prisma.emailAccount.update).not.toHaveBeenCalled();
  });
});
