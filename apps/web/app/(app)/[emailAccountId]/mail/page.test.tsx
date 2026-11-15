import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findUser: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  env: { NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS: false },
}));

vi.mock("@/utils/auth", () => ({ auth: () => mocks.auth() }));
vi.mock("@/utils/prisma", () => ({
  default: {
    user: {
      findUnique: (...args: Parameters<typeof mocks.findUser>) =>
        mocks.findUser(...args),
    },
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => mocks.redirect(url),
}));
vi.mock("@/env", () => ({ env: mocks.env }));
vi.mock("@/app/(app)/[emailAccountId]/mail/MailShell", () => ({
  MailShell: () => null,
}));
vi.mock("@/app/(app)/[emailAccountId]/PermissionsCheck", () => ({
  PermissionsCheck: () => null,
}));
vi.mock("@/providers/EmailLabelsProvider", () => ({
  EmailLabelsProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock("@/utils/mail-engine/MailEngineHost", () => ({
  MailEngineHost: ({ children }: { children: React.ReactNode }) => children,
}));

import Mail from "./page";

describe("mail page plan gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS = false;
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("sends users without a plan to the upgrade page", async () => {
    mocks.findUser.mockResolvedValue({ premium: null });

    await expect(Mail()).rejects.toThrow("redirect:/welcome-upgrade");
  });

  it("sends users whose trial ended to the upgrade page", async () => {
    mocks.findUser.mockResolvedValue({
      premium: {
        tier: "STARTER_MONTHLY",
        stripeSubscriptionStatus: "canceled",
      },
    });

    await expect(Mail()).rejects.toThrow("redirect:/welcome-upgrade");
  });

  it("opens mail for users on a trial", async () => {
    mocks.findUser.mockResolvedValue({
      premium: {
        tier: "STARTER_MONTHLY",
        stripeSubscriptionStatus: "trialing",
      },
    });

    await Mail();

    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("opens mail on self-hosted instances that bypass plan checks", async () => {
    mocks.env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS = true;
    mocks.findUser.mockResolvedValue({ premium: null });

    await Mail();

    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
