import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  cookies: vi.fn(),
  findFirst: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock("@/utils/auth", () => ({
  auth: () => mocks.auth(),
}));

vi.mock("next/headers", () => ({
  cookies: () => mocks.cookies(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mocks.redirect(url),
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    emailAccount: {
      findFirst: (...args: Parameters<typeof mocks.findFirst>) =>
        mocks.findFirst(...args),
    },
  },
}));

import { redirectToEmailAccountPath } from "./account";

describe("redirectToEmailAccountPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user_123" } });
    mocks.cookies.mockResolvedValue({ get: () => undefined });
  });

  it("sends authenticated users without an email account to mailbox connection", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await expect(redirectToEmailAccountPath("/setup")).rejects.toThrow(
      "redirect:/connect-mailbox?next=%2Fsetup",
    );

    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { userId: "user_123" },
    });
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/connect-mailbox?next=%2Fsetup",
    );
  });

  it("preserves search params when sending users to mailbox connection", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await expect(
      redirectToEmailAccountPath("/setup", {
        source: "checkout",
        step: ["one", "two"],
      }),
    ).rejects.toThrow(
      "redirect:/connect-mailbox?next=%2Fsetup%3Fsource%3Dcheckout%26step%3Done%26step%3Dtwo",
    );

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/connect-mailbox?next=%2Fsetup%3Fsource%3Dcheckout%26step%3Done%26step%3Dtwo",
    );
  });
});
