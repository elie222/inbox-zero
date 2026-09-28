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

describe("/api/mobile/push-token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers a lowercase mobile platform as the database enum", async () => {
    const response = await POST(
      request("POST", {
        token: "ExpoPushToken[new-token]",
        previousToken: "ExpoPushToken[old-token]",
        platform: "ios",
      }),
      {} as never,
    );

    expect(prisma.mobilePushToken.deleteMany).toHaveBeenCalledWith({
      where: {
        token: "ExpoPushToken[old-token]",
        userId: "user-1",
      },
    });
    expect(prisma.mobilePushToken.upsert).toHaveBeenCalledWith({
      where: { token: "ExpoPushToken[new-token]" },
      create: {
        token: "ExpoPushToken[new-token]",
        platform: MobilePushPlatform.IOS,
        tokenType: MobilePushTokenType.EXPO,
        userId: "user-1",
      },
      update: {
        platform: MobilePushPlatform.IOS,
        tokenType: MobilePushTokenType.EXPO,
        userId: "user-1",
      },
    });
    expect(response.status).toBe(200);
  });

  it("registers a raw APNs device token", async () => {
    const token = "a".repeat(64);
    const response = await POST(
      request("POST", {
        token,
        platform: "ios",
        tokenType: "apns",
      }),
      {} as never,
    );

    expect(prisma.mobilePushToken.upsert).toHaveBeenCalledWith({
      where: { token },
      create: {
        token,
        platform: MobilePushPlatform.IOS,
        tokenType: MobilePushTokenType.APNS,
        userId: "user-1",
      },
      update: {
        platform: MobilePushPlatform.IOS,
        tokenType: MobilePushTokenType.APNS,
        userId: "user-1",
      },
    });
    expect(response.status).toBe(200);
  });

  it("rejects an APNs token on Android", async () => {
    await expect(
      POST(
        request("POST", {
          token: "b".repeat(64),
          platform: "android",
          tokenType: "apns",
        }),
        {} as never,
      ),
    ).rejects.toThrow();

    expect(prisma.mobilePushToken.upsert).not.toHaveBeenCalled();
  });

  it("only unregisters the authenticated user's token", async () => {
    const response = await DELETE(
      request("DELETE", { token: "ExpoPushToken[current-token]" }),
      {} as never,
    );

    expect(prisma.mobilePushToken.deleteMany).toHaveBeenCalledWith({
      where: {
        token: "ExpoPushToken[current-token]",
        userId: "user-1",
      },
    });
    expect(response.status).toBe(200);
  });
});

function request(method: "DELETE" | "POST", body: unknown) {
  return new NextRequest("http://localhost:3000/api/mobile/push-token", {
    method,
    body: JSON.stringify(body),
  });
}
