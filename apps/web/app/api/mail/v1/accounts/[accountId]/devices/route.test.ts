import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApnsEnvironment,
  MobilePushPlatform,
  MobilePushTokenType,
} from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("@/utils/prisma");
vi.mock("@/utils/middleware", async () => {
  const { createWithEmailAccountTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithEmailAccountTestMiddleware();
});

import { DELETE, POST } from "./route";

const token = "a".repeat(64);

describe("/api/mail/v1/accounts/:accountId/devices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.mobilePushToken.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.mobilePushToken.findFirst).mockResolvedValue(null);
  });

  it("registers an APNs token for the authenticated account", async () => {
    const response = await POST(request("POST", deviceBody()), context());

    expect(prisma.mobilePushToken.upsert).toHaveBeenCalledWith({
      where: { token },
      create: {
        token,
        platform: MobilePushPlatform.IOS,
        tokenType: MobilePushTokenType.APNS,
        environment: ApnsEnvironment.SANDBOX,
        appVersion: "1.2.3",
        userId: "user-1",
        emailAccounts: { connect: [{ id: "email-account-1" }] },
      },
      update: {
        platform: MobilePushPlatform.IOS,
        tokenType: MobilePushTokenType.APNS,
        environment: ApnsEnvironment.SANDBOX,
        appVersion: "1.2.3",
        userId: "user-1",
        emailAccounts: { connect: [{ id: "email-account-1" }] },
      },
    });
    expect(response.status).toBe(200);
  });

  it("moves a token registered to another user onto this account", async () => {
    vi.mocked(prisma.mobilePushToken.findUnique).mockResolvedValue({
      userId: "other-user",
    } as never);

    await POST(request("POST", deviceBody()), context());

    expect(prisma.mobilePushToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          userId: "user-1",
          emailAccounts: { set: [{ id: "email-account-1" }] },
        }),
      }),
    );
  });

  it("rejects a token for a different account than the session", async () => {
    const response = await POST(
      request("POST", deviceBody()),
      context("other-account"),
    );

    expect(response.status).toBe(403);
    expect(prisma.mobilePushToken.upsert).not.toHaveBeenCalled();
  });

  it("rejects a non-hex device token", async () => {
    await expect(
      POST(
        request("POST", deviceBody({ token: "not-a-device-token" })),
        context(),
      ),
    ).rejects.toThrow();

    expect(prisma.mobilePushToken.upsert).not.toHaveBeenCalled();
  });

  it("unregisters only the authenticated user's token for that account", async () => {
    vi.mocked(prisma.mobilePushToken.findFirst).mockResolvedValue({
      id: "token-row",
    } as never);

    const response = await DELETE(request("DELETE", { token }), context());

    expect(prisma.mobilePushToken.findFirst).toHaveBeenCalledWith({
      where: {
        token,
        userId: "user-1",
        emailAccounts: { some: { id: "email-account-1" } },
      },
      select: { id: true },
    });
    expect(prisma.mobilePushToken.update).toHaveBeenCalledWith({
      where: { id: "token-row" },
      data: {
        emailAccounts: { disconnect: [{ id: "email-account-1" }] },
      },
    });
    expect(response.status).toBe(200);
  });
});

function deviceBody(overrides?: { token?: string }) {
  return {
    token,
    platform: "ios",
    environment: "sandbox",
    appVersion: "1.2.3",
    ...overrides,
  };
}

function request(method: "DELETE" | "POST", body: unknown) {
  return new NextRequest(
    "http://localhost:3000/api/mail/v1/accounts/email-account-1/devices",
    { method, body: JSON.stringify(body) },
  );
}

function context(accountId = "email-account-1") {
  return { params: Promise.resolve({ accountId }) };
}
