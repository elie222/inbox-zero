import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { LAST_EMAIL_ACCOUNT_COOKIE } from "@/utils/cookies";
import { setLastEmailAccountAction } from "./email-account-cookie";

const { cookiesSet } = vi.hoisted(() => ({
  cookiesSet: vi.fn(),
}));

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "primary@example.com" },
  })),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set: cookiesSet })),
}));
vi.mock("@sentry/nextjs", () => import("@/__tests__/mocks/sentry-nextjs.mock"));

describe("setLastEmailAccountAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.emailAccount.findFirst.mockResolvedValue({
      id: "account-1",
    } as Awaited<ReturnType<typeof prisma.emailAccount.findFirst>>);
  });

  it("sets the last-account cookie for an owned account", async () => {
    const result = await setLastEmailAccountAction({
      emailAccountId: "account-1",
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.emailAccount.findFirst).toHaveBeenCalledWith({
      where: { id: "account-1", userId: "user-1" },
      select: { id: true },
    });
    expect(cookiesSet).toHaveBeenCalledWith(
      LAST_EMAIL_ACCOUNT_COOKIE,
      JSON.stringify({ userId: "user-1", emailAccountId: "account-1" }),
      expect.objectContaining({
        path: "/",
        httpOnly: true,
        sameSite: "lax",
      }),
    );
  });

  it("does not mint a last-account cookie for a deleted account", async () => {
    prisma.emailAccount.findFirst.mockResolvedValue(null);

    const result = await setLastEmailAccountAction({
      emailAccountId: "deleted-account",
    });

    expect(result?.serverError).toBeUndefined();
    expect(cookiesSet).not.toHaveBeenCalled();
  });
});
