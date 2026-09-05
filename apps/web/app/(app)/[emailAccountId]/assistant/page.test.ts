import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";
import AssistantPage from "./page";

vi.mock("@/utils/prisma");
vi.mock("@/utils/email-account", () => ({
  checkUserOwnsEmailAccount: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => undefined }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("@/app/(app)/[emailAccountId]/PermissionsCheck", () => ({
  PermissionsCheck: () => null,
}));
vi.mock("@/providers/EmailProvider", () => ({ EmailProvider: () => null }));
vi.mock("@/components/assistant-chat/chat", () => ({ Chat: () => null }));

describe("AssistantPage access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkUserOwnsEmailAccount).mockResolvedValue(undefined);
    prisma.rule.findFirst.mockResolvedValue(null);
  });

  it("allows the first visit without rules or an onboarding cookie", async () => {
    await expect(
      AssistantPage({
        params: Promise.resolve({ emailAccountId: "account-1" }),
      }),
    ).resolves.toBeDefined();
    expect(checkUserOwnsEmailAccount).toHaveBeenCalledWith({
      emailAccountId: "account-1",
    });
  });

  it("still rejects access when the mailbox ownership check fails", async () => {
    vi.mocked(checkUserOwnsEmailAccount).mockRejectedValue(
      new Error("Not authenticated"),
    );

    await expect(
      AssistantPage({
        params: Promise.resolve({ emailAccountId: "account-1" }),
      }),
    ).rejects.toThrow("Not authenticated");
  });
});
