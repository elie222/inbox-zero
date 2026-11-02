import { describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import {
  createAccountLinkingRedirect,
  createTokensUpdatedRedirect,
} from "./account-linking-redirect";

vi.mock("@/utils/prisma");

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
  },
}));

describe("createAccountLinkingRedirect", () => {
  it("builds an accounts redirect and clears the linking cookie", () => {
    const response = createAccountLinkingRedirect({
      query: {
        error: "invalid_state",
        ignored: undefined,
      },
      stateCookieName: "linking_state",
    });

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/accounts?error=invalid_state",
    );
    expect(response.cookies.get("linking_state")?.value).toBe("");
    expect(response.headers.get("set-cookie")).toContain("linking_state=");
    expect(response.headers.get("set-cookie")).toContain("Expires=");
  });

  it("supports redirects without query params or cookie cleanup", () => {
    const response = createAccountLinkingRedirect();

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/accounts",
    );
    expect(response.cookies.getAll()).toEqual([]);
  });
});

describe("createTokensUpdatedRedirect", () => {
  const logger = createScopedLogger("account-linking-redirect-test");

  it("resumes onboarding for the reconnected mailbox when setup is unfinished", async () => {
    prisma.user.findUnique.mockResolvedValue({
      completedOnboardingAt: null,
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    const response = await createTokensUpdatedRedirect({
      userId: "user-1",
      reconnectEmailAccountId: "account-1",
      stateCookieName: "linking_state",
      logger,
    });

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/account-1/onboarding",
    );
    expect(response.cookies.get("linking_state")?.value).toBe("");
  });

  it("falls back to the welcome redirect without a reconnect target", async () => {
    prisma.user.findUnique.mockResolvedValue({
      completedOnboardingAt: null,
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    const response = await createTokensUpdatedRedirect({
      userId: "user-1",
      reconnectEmailAccountId: null,
      stateCookieName: "linking_state",
      logger,
    });

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/welcome-redirect",
    );
  });

  it("returns onboarded users to the accounts page", async () => {
    prisma.user.findUnique.mockResolvedValue({
      completedOnboardingAt: new Date("2026-01-01T00:00:00.000Z"),
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    const response = await createTokensUpdatedRedirect({
      userId: "user-1",
      reconnectEmailAccountId: "account-1",
      stateCookieName: "linking_state",
      logger,
    });

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/accounts?success=tokens_updated",
    );
  });

  it("still reports the reconnect when the onboarding lookup fails", async () => {
    prisma.user.findUnique.mockRejectedValue(new Error("db unavailable"));

    const response = await createTokensUpdatedRedirect({
      userId: "user-1",
      reconnectEmailAccountId: "account-1",
      stateCookieName: "linking_state",
      logger,
    });

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/accounts?success=tokens_updated",
    );
  });
});
