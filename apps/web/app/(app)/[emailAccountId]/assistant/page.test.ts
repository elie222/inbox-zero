import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRule } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";
import AssistantPage from "./page";

const onboarding = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
}));

vi.mock("@/utils/prisma");
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () =>
      onboarding.cookieValue === undefined
        ? undefined
        : { value: onboarding.cookieValue },
  })),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("@/utils/email-account", () => ({
  checkUserOwnsEmailAccount: vi.fn(),
}));
vi.mock("@/app/(app)/[emailAccountId]/PermissionsCheck", () => ({
  PermissionsCheck: () => null,
}));
vi.mock("@/providers/EmailProvider", () => ({ EmailProvider: () => null }));
vi.mock("@/components/assistant-chat/chat", () => ({ Chat: () => null }));

describe("AssistantPage onboarding access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onboarding.cookieValue = undefined;
    prisma.rule.findFirst.mockResolvedValue(null);
    vi.mocked(checkUserOwnsEmailAccount).mockResolvedValue(undefined);
  });

  it.each([
    undefined,
    "false",
  ])("sends a new account to onboarding when its cookie is %s", async (cookieValue) => {
    onboarding.cookieValue = cookieValue;
    await expect(
      AssistantPage({
        params: Promise.resolve({ emailAccountId: "account-1" }),
      }),
    ).rejects.toThrow("redirect:/account-1/onboarding");
    expect(checkUserOwnsEmailAccount).toHaveBeenCalledWith({
      emailAccountId: "account-1",
    });
  });

  it("allows chat after onboarding even when there are no rules", async () => {
    onboarding.cookieValue = "true";
    await expect(
      AssistantPage({
        params: Promise.resolve({ emailAccountId: "account-1" }),
      }),
    ).resolves.toBeDefined();
    expect(prisma.rule.findFirst).not.toHaveBeenCalled();
  });

  it("preserves access for an existing account with rules when its cookie is absent", async () => {
    prisma.rule.findFirst.mockResolvedValue(getRule("Existing mailbox rule"));
    await expect(
      AssistantPage({
        params: Promise.resolve({ emailAccountId: "account-1" }),
      }),
    ).resolves.toBeDefined();
  });

  it.each([
    "Not authenticated",
    "redirect:/no-access",
  ])("propagates %s before reading onboarding state", async (message) => {
    vi.mocked(checkUserOwnsEmailAccount).mockRejectedValue(new Error(message));
    await expect(
      AssistantPage({
        params: Promise.resolve({ emailAccountId: "account-1" }),
      }),
    ).rejects.toThrow(message);
    expect(prisma.rule.findFirst).not.toHaveBeenCalled();
  });
});
