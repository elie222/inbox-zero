import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { isMobileReviewEnabledMock } = vi.hoisted(() => ({
  isMobileReviewEnabledMock: vi.fn(),
}));

vi.mock("@/utils/mobile-review", () => ({
  isMobileReviewEnabled: () => isMobileReviewEnabledMock(),
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

import { GET } from "./route";

describe("mobile review status route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the configured review access status", async () => {
    isMobileReviewEnabledMock.mockReturnValueOnce(false);

    const request = new NextRequest(
      "http://localhost/api/mobile-review/status",
    );

    const response = await GET(request, {} as never);
    const body = await response.json();

    expect(isMobileReviewEnabledMock).toHaveBeenCalledOnce();
    expect(body).toEqual({ enabled: false });
  });
});
