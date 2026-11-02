import { describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
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
  it("resumes setup when the user has not finished onboarding", async () => {
    prisma.user.findUnique.mockResolvedValue({
      completedOnboardingAt: null,
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    const response = await createTokensUpdatedRedirect({
      userId: "user-1",
      stateCookieName: "linking_state",
    });

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/welcome-redirect",
    );
    expect(response.cookies.get("linking_state")?.value).toBe("");
  });

  it("returns onboarded users to the accounts page", async () => {
    prisma.user.findUnique.mockResolvedValue({
      completedOnboardingAt: new Date("2026-01-01T00:00:00.000Z"),
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    const response = await createTokensUpdatedRedirect({
      userId: "user-1",
      stateCookieName: "linking_state",
    });

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/accounts?success=tokens_updated",
    );
  });
});
