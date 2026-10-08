import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MobilePushPlatform,
  MobilePushTokenType,
} from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("@/utils/prisma");
vi.mock("@/utils/middleware", async () => {
  const { createWithAuthTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithAuthTestMiddleware();
});

import { DELETE, POST } from "./route";

const token = "a".repeat(64);

describe("/api/mail/v1/devices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers an APNs token for the authenticated user, including one another user already has", async () => {
    const response = await POST(request("POST", deviceBody()), {} as never);

    expect(prisma.mobilePushToken.upsert).toHaveBeenCalledWith({
      where: { token },
      create: {
        token,
        platform: MobilePushPlatform.IOS,
        tokenType: MobilePushTokenType.APNS,
        appVersion: "1.2.3",
        userId: "user-1",
      },
      update: {
        platform: MobilePushPlatform.IOS,
        tokenType: MobilePushTokenType.APNS,
        appVersion: "1.2.3",
        userId: "user-1",
      },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("stores no app version when the client omits it", async () => {
    await POST(request("POST", { token }), {} as never);

    expect(prisma.mobilePushToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ appVersion: null }),
        update: expect.objectContaining({ appVersion: null }),
      }),
    );
  });

  it("returns 400 for invalid JSON", async () => {
    const register = await POST(rawRequest("POST", "{"), {} as never);
    const unregister = await DELETE(rawRequest("DELETE", "{"), {} as never);

    expect(register.status).toBe(400);
    expect(unregister.status).toBe(400);
    await expect(register.json()).resolves.toEqual({
      error: "Invalid JSON",
      isKnownError: true,
    });
    expect(prisma.mobilePushToken.upsert).not.toHaveBeenCalled();
    expect(prisma.mobilePushToken.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects a non-hex device token", async () => {
    await expect(
      POST(
        request("POST", deviceBody({ token: "not-a-device-token" })),
        {} as never,
      ),
    ).rejects.toThrow();

    expect(prisma.mobilePushToken.upsert).not.toHaveBeenCalled();
  });

  it("deletes only the authenticated user's token", async () => {
    const response = await DELETE(request("DELETE", { token }), {} as never);

    expect(prisma.mobilePushToken.deleteMany).toHaveBeenCalledWith({
      where: { token, userId: "user-1" },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});

function deviceBody(overrides?: { token?: string; appVersion?: string }) {
  return {
    token,
    appVersion: "1.2.3",
    ...overrides,
  };
}

function rawRequest(method: "DELETE" | "POST", body: string) {
  return new NextRequest("http://localhost:3000/api/mail/v1/devices", {
    method,
    body,
    headers: { "content-type": "application/json" },
  });
}

function request(method: "DELETE" | "POST", body: unknown) {
  return new NextRequest("http://localhost:3000/api/mail/v1/devices", {
    method,
    body: JSON.stringify(body),
  });
}
