import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { checkUserOwnsEmailAccount } from "./email-account";

const { authMock, redirectMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: authMock,
}));
vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

describe("checkUserOwnsEmailAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    authMock.mockResolvedValue({
      user: { id: "user-1", email: "user@example.com" },
    });
    redirectMock.mockImplementation((url: string) => {
      throw new Error(`redirect:${url}`);
    });
  });

  it("redirects logged-out users to login", async () => {
    authMock.mockResolvedValue(null);

    await expect(
      checkUserOwnsEmailAccount({ emailAccountId: "email-account-1" }),
    ).rejects.toThrow("redirect:/login");
  });

  it("logs out users whose session is missing a user id", async () => {
    authMock.mockResolvedValue({ user: { email: "user@example.com" } });

    await expect(
      checkUserOwnsEmailAccount({ emailAccountId: "email-account-1" }),
    ).rejects.toThrow("redirect:/logout");
  });

  it("redirects users away from accounts they do not own", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(null);

    await expect(
      checkUserOwnsEmailAccount({ emailAccountId: "email-account-1" }),
    ).rejects.toThrow("redirect:/no-access");

    expect(prisma.emailAccount.findUnique).toHaveBeenCalledWith({
      where: { id: "email-account-1", userId: "user-1" },
      select: { id: true },
    });
  });
});
