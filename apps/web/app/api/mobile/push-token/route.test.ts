import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobilePushPlatform } from "@/generated/prisma/enums";
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
        userId: "user-1",
      },
      update: {
        platform: MobilePushPlatform.IOS,
        userId: "user-1",
      },
    });
    expect(response.status).toBe(200);
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
