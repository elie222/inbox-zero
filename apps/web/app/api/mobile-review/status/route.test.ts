vi.mock("server-only", () => ({}));

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMobileReviewAccessStatusMock } = vi.hoisted(() => ({
  getMobileReviewAccessStatusMock: vi.fn(),
}));

vi.mock("@/utils/mobile-review", () => ({
  getMobileReviewAccessStatus: (...args: unknown[]) =>
    getMobileReviewAccessStatusMock(...args),
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

import { GET } from "./route";

describe("mobile review status route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the validated review access status", async () => {
    getMobileReviewAccessStatusMock.mockResolvedValueOnce({ enabled: false });

    const request = new NextRequest(
      "http://localhost/api/mobile-review/status",
    ) as NextRequest & {
      logger: {
        warn: ReturnType<typeof vi.fn>;
      };
    };
    request.logger = {
      warn: vi.fn(),
    };

    const response = await GET(request, {} as never);
    const body = await response.json();

    expect(getMobileReviewAccessStatusMock).toHaveBeenCalledWith({
      logger: request.logger,
    });
    expect(body).toEqual({ enabled: false });
  });
});
