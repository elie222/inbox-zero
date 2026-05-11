import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createMobileReviewSessionMock, loggerInfoMock } = vi.hoisted(() => ({
  createMobileReviewSessionMock: vi.fn(),
  loggerInfoMock: vi.fn(),
}));

vi.mock("@/utils/mobile-review", () => ({
  createMobileReviewSession: createMobileReviewSessionMock,
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

describe("mobile review sign-in route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMobileReviewSessionMock.mockResolvedValue({
      emailAccountId: "account-1",
      sessionCookie: {
        name: "__Secure-better-auth.session_token",
        options: {
          expires: new Date("2026-05-01T00:00:00.000Z"),
          httpOnly: true,
          path: "/",
          sameSite: "lax",
          secure: true,
        },
        value: "signed-session-token",
      },
      userEmail: "review@example.com",
      userId: "user-1",
    });
  });

  it("sets the cookie header without echoing it in the response body", async () => {
    const request = new NextRequest(
      "http://localhost/api/mobile-review/sign-in",
      {
        body: JSON.stringify({
          code: "review-code",
          email: "review@example.com",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      },
    ) as NextRequest & { logger: { info: typeof loggerInfoMock } };
    request.logger = { info: loggerInfoMock };

    const response = await POST(request, {} as never);
    const body = await response.json();

    expect(createMobileReviewSessionMock).toHaveBeenCalledWith({
      code: "review-code",
      email: "review@example.com",
      logger: request.logger,
    });
    expect(body).toEqual({ success: true });
    expect(body.setCookie).toBeUndefined();
    expect(response.headers.get("set-cookie")).toContain(
      "__Secure-better-auth.session_token=signed-session-token",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "Created mobile review session",
      {
        reviewEmailAccountId: "account-1",
        reviewUserEmail: "review@example.com",
        reviewUserId: "user-1",
      },
    );
  });

  it("rejects sign-in requests without an email", async () => {
    const request = new NextRequest(
      "http://localhost/api/mobile-review/sign-in",
      {
        body: JSON.stringify({ code: "review-code" }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      },
    ) as NextRequest & { logger: { info: typeof loggerInfoMock } };
    request.logger = { info: loggerInfoMock };

    await expect(POST(request, {} as never)).rejects.toThrow();
    expect(createMobileReviewSessionMock).not.toHaveBeenCalled();
  });
});
