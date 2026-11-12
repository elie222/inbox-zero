import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import prisma from "@/utils/__mocks__/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";
import { getUnhandledCount } from "@/utils/assess";
import { SafeError } from "@/utils/error";
import CleanPage from "./page";

vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider");
vi.mock("@/utils/email-account", () => ({
  checkUserOwnsEmailAccount: vi.fn(),
}));
vi.mock("@/utils/assess", () => ({ getUnhandledCount: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock("@/app/(app)/[emailAccountId]/clean/IntroStep", () => ({
  IntroStep: () => null,
}));
vi.mock("@/app/(app)/[emailAccountId]/clean/ActionSelectionStep", () => ({
  ActionSelectionStep: () => null,
}));
vi.mock("@/app/(app)/[emailAccountId]/clean/CleanInstructionsStep", () => ({
  CleanInstructionsStep: () => null,
}));
vi.mock("@/app/(app)/[emailAccountId]/clean/TimeRangeStep", () => ({
  TimeRangeStep: () => null,
}));
vi.mock("@/app/(app)/[emailAccountId]/clean/ConfirmationStep", () => ({
  ConfirmationStep: () => null,
}));

describe("Clean onboarding account connection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkUserOwnsEmailAccount).mockResolvedValue(undefined);
    prisma.emailAccount.findUnique.mockResolvedValue({
      account: { provider: "google" },
    } as Awaited<ReturnType<typeof prisma.emailAccount.findUnique>>);
    vi.mocked(createEmailProvider).mockResolvedValue(
      {} as Awaited<ReturnType<typeof createEmailProvider>>,
    );
    vi.mocked(getUnhandledCount).mockResolvedValue({
      unhandledCount: 12,
      type: "inbox",
    });
  });

  it("redirects a disconnected account to the existing reconnect flow", async () => {
    vi.mocked(createEmailProvider).mockRejectedValue(
      new SafeError("No refresh token"),
    );

    await expect(openPage()).rejects.toThrow(
      "redirect:/account-1/permissions/consent",
    );
    expect(getUnhandledCount).not.toHaveBeenCalled();
  });

  it("handles a missing token while loading the inbox count", async () => {
    vi.mocked(getUnhandledCount).mockRejectedValue(
      new SafeError("No refresh token"),
    );

    await expect(openPage()).rejects.toThrow(
      "redirect:/account-1/permissions/consent",
    );
  });

  it.each([
    "provider",
    "count",
  ])("preserves unrelated %s failures", async (source) => {
    const error = new Error("Synthetic provider failure");
    if (source === "provider") {
      vi.mocked(createEmailProvider).mockRejectedValue(error);
    } else {
      vi.mocked(getUnhandledCount).mockRejectedValue(error);
    }

    await expect(openPage()).rejects.toBe(error);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("continues onboarding for a connected account", async () => {
    await expect(openPage()).resolves.toBeDefined();
    expect(getUnhandledCount).toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("checks account ownership before accessing the provider", async () => {
    const error = new Error("Not authenticated");
    vi.mocked(checkUserOwnsEmailAccount).mockRejectedValue(error);

    await expect(openPage()).rejects.toBe(error);
    expect(createEmailProvider).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});

function openPage() {
  return CleanPage({
    params: Promise.resolve({ emailAccountId: "account-1" }),
    searchParams: Promise.resolve({ step: "" }),
  });
}
