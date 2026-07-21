import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindMany, mockGetThreadsWithQuery } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockGetThreadsWithQuery: vi.fn(),
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    executedRule: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

vi.mock("@/utils/middleware", () => ({
  withEmailProvider:
    (
      _name: string,
      handler: (
        request: NextRequest & Record<string, unknown>,
      ) => Promise<Response>,
    ) =>
    (request: NextRequest) =>
      handler(
        Object.assign(request, {
          auth: { emailAccountId: "email-account-id" },
          emailProvider: { getThreadsWithQuery: mockGetThreadsWithQuery },
          logger: { error: vi.fn() },
        }),
      ),
}));

import { GET } from "./route";

describe("GET /api/threads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockGetThreadsWithQuery.mockResolvedValue({ threads: [] });
  });

  it("passes multiple label IDs to the email provider", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/threads?labelId=Label_123&labelIds=Label_123%2CINBOX&limit=100",
      ),
    );

    expect(response.status).toBe(200);
    expect(mockGetThreadsWithQuery).toHaveBeenCalledWith({
      query: expect.objectContaining({
        labelId: "Label_123",
        labelIds: ["Label_123", "INBOX"],
        limit: 100,
      }),
      maxResults: 100,
      pageToken: undefined,
    });
  });
});
