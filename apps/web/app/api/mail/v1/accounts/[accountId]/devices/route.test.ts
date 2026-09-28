import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MailboxPushEnvironment,
  MailboxPushPlatform,
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
  });

  it("registers an APNs token for the authenticated account", async () => {
    const response = await POST(request("POST", deviceBody()), context());

    expect(prisma.mailboxPushDevice.deleteMany).toHaveBeenCalledWith({
      where: { token, userId: { not: "user-1" } },
    });
    expect(prisma.mailboxPushDevice.upsert).toHaveBeenCalledWith({
      where: {
        token_emailAccountId: {
          token,
          emailAccountId: "email-account-1",
        },
      },
      create: {
        token,
        platform: MailboxPushPlatform.IOS,
        environment: MailboxPushEnvironment.SANDBOX,
        appVersion: "1.2.3",
        userId: "user-1",
        emailAccountId: "email-account-1",
      },
      update: {
        platform: MailboxPushPlatform.IOS,
        environment: MailboxPushEnvironment.SANDBOX,
        appVersion: "1.2.3",
        userId: "user-1",
      },
    });
    expect(response.status).toBe(200);
  });

  it("rejects a token for a different account than the session", async () => {
    const response = await POST(
      request("POST", deviceBody()),
      context("other-account"),
    );

    expect(response.status).toBe(403);
    expect(prisma.mailboxPushDevice.upsert).not.toHaveBeenCalled();
  });

  it("rejects a non-hex device token", async () => {
    await expect(
      POST(
        request("POST", deviceBody({ token: "not-a-device-token" })),
        context(),
      ),
    ).rejects.toThrow();

    expect(prisma.mailboxPushDevice.upsert).not.toHaveBeenCalled();
  });

  it("unregisters only the authenticated user's token for that account", async () => {
    const response = await DELETE(request("DELETE", { token }), context());

    expect(prisma.mailboxPushDevice.deleteMany).toHaveBeenCalledWith({
      where: {
        token,
        userId: "user-1",
        emailAccountId: "email-account-1",
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
