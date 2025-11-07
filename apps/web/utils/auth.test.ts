import { describe, it, expect, vi, beforeEach } from "vitest";
import { cookies } from "next/headers";
import { createReferral } from "@/utils/referral/referral-code";
import { captureException } from "@/utils/error";
import { handleReferralOnSignUp } from "@/utils/auth";

// Mock the dependencies
vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("@/utils/referral/referral-code", () => ({
  createReferral: vi.fn(),
}));

vi.mock("@/utils/error", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/utils/logger", () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import the real function from auth.ts for testing

describe("handleReferralOnSignUp", () => {
  const mockCookies = vi.mocked(cookies);
  const mockCreateReferral = vi.mocked(createReferral);
  const mockCaptureException = vi.mocked(captureException);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create referral when referral code cookie exists", async () => {
    const userId = "user123";
    const email = "user@example.com";
    const referralCode = "ABC123";

    mockCookies.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: referralCode }),
    } as any);

    mockCreateReferral.mockResolvedValue({} as any);

    await handleReferralOnSignUp({ userId, email });

    expect(mockCreateReferral).toHaveBeenCalledWith(userId, referralCode);
  });

  it("should not create referral when no referral code cookie exists", async () => {
    const userId = "user123";
    const email = "user@example.com";

    mockCookies.mockResolvedValue({
      get: vi.fn().mockReturnValue(undefined),
    } as any);

    await handleReferralOnSignUp({ userId, email });

    expect(mockCreateReferral).not.toHaveBeenCalled();
  });

  it("should handle errors gracefully and not throw", async () => {
    const userId = "user123";
    const email = "user@example.com";
    const referralCode = "ABC123";
    const error = new Error("Referral creation failed");

    mockCookies.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: referralCode }),
    } as any);

    mockCreateReferral.mockRejectedValue(error);

    // Should not throw
    await expect(
      handleReferralOnSignUp({ userId, email }),
    ).resolves.toBeUndefined();

    expect(mockCaptureException).toHaveBeenCalledWith(error, {
      extra: { userId, email, location: "handleReferralOnSignUp" },
    });
  });

  it("should not create referral when referral code cookie has empty value", async () => {
    const userId = "user123";
    const email = "user@example.com";

    mockCookies.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "" }),
    } as any);

    await handleReferralOnSignUp({ userId, email });

    expect(mockCreateReferral).not.toHaveBeenCalled();
  });
});
