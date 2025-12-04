import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleAccountLinking } from "./account-linking";
import prisma from "@/utils/__mocks__/prisma";
import { getMockEmailAccountSelect } from "@/__tests__/helpers";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("test");

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
  },
}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/user/orphaned-account");

describe("handleAccountLinking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should cleanup orphaned account and continue create", async () => {
    const { cleanupOrphanedAccount } = await import(
      "@/utils/user/orphaned-account"
    );
    vi.mocked(cleanupOrphanedAccount).mockResolvedValue();

    const result = await handleAccountLinking({
      existingAccountId: "orphaned-account-id",
      hasEmailAccount: false,
      existingUserId: "orphaned-user-id",
      targetUserId: "target-user-id",
      provider: "google",
      providerEmail: "test@gmail.com",
      logger,
    });

    expect(cleanupOrphanedAccount).toHaveBeenCalledWith(
      "orphaned-account-id",
      logger,
    );
    expect(result).toEqual({ type: "continue_create" });
  });

  it("should return continue_create when no existing account", async () => {
    const result = await handleAccountLinking({
      existingAccountId: null,
      hasEmailAccount: false,
      existingUserId: null,
      targetUserId: "target-user-id",
      provider: "google",
      providerEmail: "new@gmail.com",
      logger,
    });

    expect(result).toEqual({ type: "continue_create" });
  });

  it("should return update_tokens when account already linked to self", async () => {
    const result = await handleAccountLinking({
      existingAccountId: "account-id",
      hasEmailAccount: true,
      existingUserId: "same-user-id",
      targetUserId: "same-user-id",
      provider: "google",
      providerEmail: "test@gmail.com",
      logger,
    });

    expect(result).toEqual({
      type: "update_tokens",
      existingAccountId: "account-id",
    });
  });

  it("should return merge when account exists for different user", async () => {
    const result = await handleAccountLinking({
      existingAccountId: "account-id",
      hasEmailAccount: true,
      existingUserId: "different-user-id",
      targetUserId: "target-user-id",
      provider: "google",
      providerEmail: "test@gmail.com",
      logger,
    });

    expect(result).toEqual({
      type: "merge",
      sourceAccountId: "account-id",
      sourceUserId: "different-user-id",
    });
  });

  it("should redirect with error when creating account that already exists for different user", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(
      getMockEmailAccountSelect({
        userId: "different-user-id",
        email: "existing@gmail.com",
      }) as any,
    );

    const result = await handleAccountLinking({
      existingAccountId: null,
      hasEmailAccount: false,
      existingUserId: null,
      targetUserId: "target-user-id",
      provider: "google",
      providerEmail: "existing@gmail.com",
      logger,
    });

    expect(result.type).toBe("redirect");
    if (result.type === "redirect") {
      const url = new URL(result.response.headers.get("location") || "");
      expect(url.searchParams.get("error")).toBe(
        "account_already_exists_use_merge",
      );
    }
  });
});
