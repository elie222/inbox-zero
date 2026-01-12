import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyEmailAccountAccess } from "./verify";
import { RedirectError } from "./redirect";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/utils/auth";

const mockAuth = vi.mocked(auth);
const logger = createScopedLogger("test");

describe("verifyEmailAccountAccess", () => {
  const emailAccountId = "email-account-123";
  const userId = "user-123";
  const redirectUrl = new URL("http://localhost:3000/callback");
  const responseHeaders = new Headers();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return userId when session and email account are valid", async () => {
    mockAuth.mockResolvedValue({
      user: { id: userId },
    } as any);

    prisma.emailAccount.findFirst.mockResolvedValue({
      id: emailAccountId,
    } as any);

    const result = await verifyEmailAccountAccess(
      emailAccountId,
      logger,
      redirectUrl,
      responseHeaders,
    );

    expect(result).toEqual({ userId });
    expect(mockAuth).toHaveBeenCalledOnce();
    expect(prisma.emailAccount.findFirst).toHaveBeenCalledWith({
      where: {
        id: emailAccountId,
        userId,
      },
      select: { id: true },
    });
  });

  it("should throw RedirectError with unauthorized when no session", async () => {
    mockAuth.mockResolvedValue(null);

    try {
      await verifyEmailAccountAccess(
        emailAccountId,
        logger,
        redirectUrl,
        responseHeaders,
      );
      expect.fail("Should have thrown RedirectError");
    } catch (error) {
      expect(error).toBeInstanceOf(RedirectError);
      if (error instanceof RedirectError) {
        expect(error.redirectUrl.searchParams.get("error")).toBe(
          "unauthorized",
        );
        expect(error.responseHeaders).toBe(responseHeaders);
      }
    }

    expect(prisma.emailAccount.findFirst).not.toHaveBeenCalled();
  });

  it("should throw RedirectError with unauthorized when session has no user", async () => {
    mockAuth.mockResolvedValue({} as any);

    try {
      await verifyEmailAccountAccess(
        emailAccountId,
        logger,
        redirectUrl,
        responseHeaders,
      );
      expect.fail("Should have thrown RedirectError");
    } catch (error) {
      expect(error).toBeInstanceOf(RedirectError);
      if (error instanceof RedirectError) {
        expect(error.redirectUrl.searchParams.get("error")).toBe(
          "unauthorized",
        );
        expect(error.responseHeaders).toBe(responseHeaders);
      }
    }

    expect(prisma.emailAccount.findFirst).not.toHaveBeenCalled();
  });

  it("should throw RedirectError with forbidden when email account does not exist", async () => {
    mockAuth.mockResolvedValue({
      user: { id: userId },
    } as any);

    prisma.emailAccount.findFirst.mockResolvedValue(null);

    try {
      await verifyEmailAccountAccess(
        emailAccountId,
        logger,
        redirectUrl,
        responseHeaders,
      );
      expect.fail("Should have thrown RedirectError");
    } catch (error) {
      expect(error).toBeInstanceOf(RedirectError);
      if (error instanceof RedirectError) {
        expect(error.redirectUrl.searchParams.get("error")).toBe("forbidden");
        expect(error.responseHeaders).toBe(responseHeaders);
      }
    }

    expect(mockAuth).toHaveBeenCalled();
    expect(prisma.emailAccount.findFirst).toHaveBeenCalledWith({
      where: {
        id: emailAccountId,
        userId,
      },
      select: { id: true },
    });
  });
});
