import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";
import AssistantPage from "./page";

vi.mock("@/utils/email-account", () => ({
  checkUserOwnsEmailAccount: vi.fn(),
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
  });

  it("allows direct chat for a mailbox owned by the user", async () => {
    await expect(
      AssistantPage({
        params: Promise.resolve({ emailAccountId: "account-1" }),
      }),
    ).resolves.toBeDefined();
    expect(checkUserOwnsEmailAccount).toHaveBeenCalledWith({
      emailAccountId: "account-1",
    });
  });

  it.each([
    "Not authenticated",
    "redirect:/no-access",
  ])("preserves the access denial: %s", async (message) => {
    vi.mocked(checkUserOwnsEmailAccount).mockRejectedValue(new Error(message));
    await expect(
      AssistantPage({
        params: Promise.resolve({ emailAccountId: "account-1" }),
      }),
    ).rejects.toThrow(message);
  });
});
