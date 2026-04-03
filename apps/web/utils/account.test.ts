import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { redirectToEmailAccountPath } from "./account";

const {
  authMock,
  cookiesMock,
  notFoundMock,
  parseLastEmailAccountCookieValueMock,
  redirectMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  cookiesMock: vi.fn(),
  notFoundMock: vi.fn(),
  parseLastEmailAccountCookieValueMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: authMock,
}));
vi.mock("@/utils/cookies", () => ({
  LAST_EMAIL_ACCOUNT_COOKIE: "last-email-account",
  parseLastEmailAccountCookieValue: parseLastEmailAccountCookieValueMock,
}));
vi.mock("@/utils/gmail/client", () => ({
  getAccessTokenFromClient: vi.fn(),
  getGmailClientWithRefresh: vi.fn(),
}));
vi.mock("@/utils/outlook/client", () => ({
  getAccessTokenFromClient: vi.fn(),
  getOutlookClientWithRefresh: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));
vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}));

describe("redirectToEmailAccountPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    authMock.mockResolvedValue({ user: { id: "user-1" } });
    cookiesMock.mockResolvedValue({
      get: vi.fn().mockReturnValue(undefined),
    });
    parseLastEmailAccountCookieValueMock.mockReturnValue(null);
    redirectMock.mockImplementation((url: string) => {
      throw new Error(`redirect:${url}`);
    });
    notFoundMock.mockImplementation(() => {
      throw new Error("notFound");
    });
  });

  it("redirects logged-out visitors to login with the original destination preserved", async () => {
    authMock.mockResolvedValue(null);

    await expect(
      redirectToEmailAccountPath("/automation", { tab: "settings" }),
    ).rejects.toThrow("redirect:/login?next=%2Fautomation%3Ftab%3Dsettings");

    expect(redirectMock).toHaveBeenCalledWith(
      "/login?next=%2Fautomation%3Ftab%3Dsettings",
    );
    expect(prisma.emailAccount.findFirst).not.toHaveBeenCalled();
  });

  it("logs out users whose session is missing a user id", async () => {
    authMock.mockResolvedValue({ user: { email: "user@example.com" } });

    await expect(
      redirectToEmailAccountPath("/automation", { tab: "settings" }),
    ).rejects.toThrow("redirect:/logout");

    expect(redirectMock).toHaveBeenCalledWith("/logout");
    expect(prisma.emailAccount.findFirst).not.toHaveBeenCalled();
  });

  it("falls back to the first inbox account when no last-account cookie is available", async () => {
    prisma.emailAccount.findFirst.mockResolvedValue({
      id: "email-account-1",
    } as never);

    await expect(
      redirectToEmailAccountPath("/automation", { tab: "settings" }),
    ).rejects.toThrow("redirect:/email-account-1/automation?tab=settings");

    expect(prisma.emailAccount.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
  });

  it("returns not found when the user has no inbox accounts", async () => {
    prisma.emailAccount.findFirst.mockResolvedValue(null);

    await expect(redirectToEmailAccountPath("/automation")).rejects.toThrow(
      "notFound",
    );

    expect(notFoundMock).toHaveBeenCalled();
  });
});
