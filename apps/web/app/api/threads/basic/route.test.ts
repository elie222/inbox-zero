import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SafeError } from "@/utils/error";

const mockGetThreadsWithQuery = vi.fn();

vi.mock("@/utils/middleware", () => ({
  withEmailProvider:
    (
      _name: string,
      handler: (
        request: NextRequest & Record<string, unknown>,
      ) => Promise<Response>,
    ) =>
    async (request: NextRequest) => {
      try {
        return await handler(
          Object.assign(request, {
            auth: { emailAccountId: "email-account-id" },
            emailProvider: {
              name: "google",
              getThreadsWithQuery: mockGetThreadsWithQuery,
            },
            logger: { error: vi.fn() },
          }),
        );
      } catch (error) {
        if (error instanceof SafeError) {
          return Response.json(
            { error: error.safeMessage, isKnownError: true },
            { status: error.statusCode },
          );
        }
        throw error;
      }
    },
}));

import { GET } from "./route";

describe("GET /api/threads/basic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves provider rate limits as a known 429 response", async () => {
    mockGetThreadsWithQuery.mockRejectedValue(
      new Error("Batch request failed", {
        cause: Object.assign(new Error("Provider request was throttled"), {
          response: { status: 429 },
        }),
      }),
    );

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/threads/basic?fromEmail=sender%40example.com",
      ),
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ isKnownError: true });
  });

  it("keeps unrelated provider failures as generic server errors", async () => {
    mockGetThreadsWithQuery.mockRejectedValue(new Error("Provider failed"));

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/threads/basic?fromEmail=sender%40example.com",
      ),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Failed to fetch threads",
    });
  });
});
