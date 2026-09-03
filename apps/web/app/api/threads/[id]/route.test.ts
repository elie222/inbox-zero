import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SafeError } from "@/utils/error";
import { GET } from "./route";

const mockGetThread = vi.fn();

vi.mock("@/utils/middleware", () => ({
  withEmailProvider:
    (
      _name: string,
      handler: (
        request: NextRequest & Record<string, unknown>,
        context: { params: Promise<Record<string, string>> },
      ) => Promise<Response>,
    ) =>
    async (
      request: NextRequest,
      context: { params: Promise<Record<string, string>> },
    ) => {
      try {
        return await handler(
          Object.assign(request, {
            auth: { emailAccountId: "email-account-id" },
            emailProvider: {
              name: "google",
              getThread: mockGetThread,
            },
            logger: { error: vi.fn() },
          }),
          context,
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

describe("GET /api/threads/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a provider-specific known error when Gmail is throttling", async () => {
    mockGetThread.mockRejectedValue(
      Object.assign(new Error("Provider request was throttled"), {
        code: 403,
        errors: [{ reason: "rateLimitExceeded" }],
      }),
    );

    const response = await getThread();

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error:
        "Gmail is temporarily limiting requests. Please try again shortly.",
      isKnownError: true,
    });
  });

  it("keeps unrelated provider failures generic", async () => {
    mockGetThread.mockRejectedValue(new Error("Provider failed"));

    const response = await getThread();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to fetch thread" });
  });

  it.each([
    ["without drafts by default", "", false],
    ["with drafts when requested", "?includeDrafts=true", true],
  ])("loads the thread %s", async (_description, query, includeDrafts) => {
    mockGetThread.mockResolvedValue({
      id: "thread-id",
      messages: [],
      snippet: "",
    });

    const response = await getThread(query);

    expect(response.status).toBe(200);
    expect(mockGetThread).toHaveBeenCalledWith("thread-id", { includeDrafts });
  });
});

function getThread(query = "") {
  return GET(
    new NextRequest(`http://localhost:3000/api/threads/thread-id${query}`),
    {
      params: Promise.resolve({ id: "thread-id" }),
    },
  );
}
