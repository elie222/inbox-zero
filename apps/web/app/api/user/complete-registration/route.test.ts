import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, sendCompleteRegistrationEventMock, trackUserSignedUpMock } =
  vi.hoisted(() => ({
    authMock: vi.fn(),
    sendCompleteRegistrationEventMock: vi.fn(),
    trackUserSignedUpMock: vi.fn(),
  }));

vi.mock("@/utils/auth", () => ({
  auth: authMock,
}));
vi.mock("@/utils/fb", () => ({
  sendCompleteRegistrationEvent: sendCompleteRegistrationEventMock,
}));
vi.mock("@/utils/posthog", () => ({
  trackUserSignedUp: trackUserSignedUpMock,
}));
vi.mock("@/utils/prisma", () => ({
  default: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));
vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

import { POST } from "./route";

describe("complete registration route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("softly skips registration tracking when the user is not authenticated", async () => {
    authMock.mockResolvedValue(null);

    const response = await POST(
      new NextRequest("http://localhost:3000/api/user/complete-registration", {
        method: "POST",
      }),
      {} as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: false,
      reason: "not_authenticated",
    });
    expect(sendCompleteRegistrationEventMock).not.toHaveBeenCalled();
    expect(trackUserSignedUpMock).not.toHaveBeenCalled();
  });
});
