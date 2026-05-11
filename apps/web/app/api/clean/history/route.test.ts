import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SafeError } from "@/utils/error";

const { cleanerEnv, mockFindMany } = vi.hoisted(() => ({
  cleanerEnv: {
    NEXT_PUBLIC_CLEANER_ENABLED: true,
  },
  mockFindMany: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: cleanerEnv,
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    cleanupJob: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
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
        emailAccountId: "email-account-id",
        userId: "user-1",
        email: "user@example.com",
      };
      try {
        return await handler(emailRequest);
      } catch (error) {
        if (error instanceof SafeError) {
          return NextResponse.json(
            { error: error.safeMessage, isKnownError: true },
            { status: error.statusCode ?? 400 },
          );
        }

        throw error;
      }
    },
}));

import { GET } from "./route";

describe("clean history route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanerEnv.NEXT_PUBLIC_CLEANER_ENABLED = true;
  });

  it("returns not found when cleaner is disabled on self-hosted", async () => {
    cleanerEnv.NEXT_PUBLIC_CLEANER_ENABLED = false;

    const response = await GET(
      new NextRequest("http://localhost:3000/api/clean/history"),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Cleaner is not enabled",
      isKnownError: true,
    });
    expect(mockFindMany).not.toHaveBeenCalled();
  });
});
