import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createApiKeyAction,
  deactivateApiKeyAction,
} from "@/utils/actions/api-key";
import prisma from "@/utils/__mocks__/prisma";

const { currentSession } = vi.hoisted(() => ({
  currentSession: { emailOtp: false },
}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "owner@example.com" },
    session: currentSession,
  })),
}));
vi.mock("@/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/env")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      NEXT_PUBLIC_EXTERNAL_API_ENABLED: true,
      API_KEY_SALT: "test-api-key-salt",
    },
  };
});

describe("API key actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSession.emailOtp = false;
    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "owner@example.com",
      account: { userId: "user-1", provider: "google" },
    } as never);
  });

  it("rejects permanent key creation from an email code session", async () => {
    currentSession.emailOtp = true;
    const result = await createApiKeyAction("account-1", {
      scopes: ["RULES_READ"],
      expiresIn: "never",
    });
    expect(result?.serverError).toBe(
      "Sign in with your connected provider to manage API keys.",
    );
    expect(prisma.apiKey.create).not.toHaveBeenCalled();
  });

  it("allows provider sessions to create a permanent key", async () => {
    const result = await createApiKeyAction("account-1", {
      scopes: ["RULES_READ"],
      expiresIn: "never",
    });
    expect(result?.serverError).toBeUndefined();
    expect(result?.data?.secretKey).toBeTruthy();
    expect(prisma.apiKey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ expiresAt: null, userId: "user-1" }),
    });
  });

  it("rejects key management from an email code session", async () => {
    currentSession.emailOtp = true;
    const result = await deactivateApiKeyAction("account-1", { id: "key-1" });
    expect(result?.serverError).toBe(
      "Sign in with your connected provider to manage API keys.",
    );
    expect(prisma.apiKey.update).not.toHaveBeenCalled();
  });
});
