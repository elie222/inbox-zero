vi.mock("server-only", () => ({}));

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
vi.mock("@/utils/middleware", () => ({
  withError:
    (
      _scope: string,
      handler: (request: NextRequest, ...args: unknown[]) => Promise<Response>,
    ) =>
    (request: NextRequest, ...args: unknown[]) =>
      handler(request, ...args),
}));

import { POST } from "./route";

describe("complete registration route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the user is not authenticated", async () => {
    authMock.mockResolvedValue(null);

    const response = await POST(
      new NextRequest("http://localhost:3000/api/user/complete-registration", {
        method: "POST",
      }),
      {} as never,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Not authenticated",
    });
    expect(sendCompleteRegistrationEventMock).not.toHaveBeenCalled();
    expect(trackUserSignedUpMock).not.toHaveBeenCalled();
  });
});
