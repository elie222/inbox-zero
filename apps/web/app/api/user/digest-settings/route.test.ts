import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindUnique } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    emailAccount: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

vi.mock("@/utils/middleware", () => ({
  withEmailAccount:
    (
      _scope: string,
      handler: (
        request: NextRequest & {
          auth: { emailAccountId: string; userId: string; email: string };
        },
      ) => Promise<Response>,
    ) =>
    async (request: NextRequest) => {
      const emailRequest = request as NextRequest & {
        auth: { emailAccountId: string; userId: string; email: string };
      };
      emailRequest.auth = {
        emailAccountId: "missing-email-account-id",
        userId: "user-1",
        email: "user@example.com",
      };

      return handler(emailRequest);
    },
}));

import { GET } from "./route";

describe("digest settings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the complete default settings shape when the email account is missing", async () => {
    mockFindUnique.mockResolvedValue(null);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/user/digest-settings"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      toReply: false,
      awaitingReply: false,
      fyi: false,
      actioned: false,
      newsletter: false,
      marketing: false,
      calendar: false,
      receipt: false,
      notification: false,
      coldEmail: false,
    });
  });
});
