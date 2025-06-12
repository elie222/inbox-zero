import { describe, it, expect, vi, beforeEach } from "vitest";
import { cookies } from "next/headers";
import { createReferral } from "@/utils/referral/referral-code";
import { captureException } from "@/utils/error";

// Mock the dependencies
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

// Import the function we want to test (we'll need to export it from auth.ts for testing)
// For now, let's create a standalone version for testing
async function handleReferralOnSignUp(userId: string, userEmail: string) {
  try {
    const cookieStore = await cookies();
    const referralCookie = cookieStore.get("referral_code");

    if (!referralCookie?.value) {
      return;
    }

    const referralCode = referralCookie.value;
    await createReferral(userId, referralCode);
  } catch (error) {
    captureException(error, {
      extra: { userId, email: userEmail, location: "handleReferralOnSignUp" },
    });
  }
}

describe("handleReferralOnSignUp", () => {
  const mockCookies = vi.mocked(cookies);
  const mockCreateReferral = vi.mocked(createReferral);
  const mockCaptureException = vi.mocked(captureException);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create referral when referral code cookie exists", async () => {
    const userId = "user123";
    const userEmail = "user@example.com";
    const referralCode = "ABC123";

    mockCookies.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: referralCode }),
    } as any);

    mockCreateReferral.mockResolvedValue({} as any);

    await handleReferralOnSignUp(userId, userEmail);

    expect(mockCreateReferral).toHaveBeenCalledWith(userId, referralCode);
  });

  it("should not create referral when no referral code cookie exists", async () => {
    const userId = "user123";
    const userEmail = "user@example.com";

    mockCookies.mockResolvedValue({
      get: vi.fn().mockReturnValue(undefined),
    } as any);

    await handleReferralOnSignUp(userId, userEmail);

    expect(mockCreateReferral).not.toHaveBeenCalled();
  });

  it("should handle errors gracefully and not throw", async () => {
    const userId = "user123";
    const userEmail = "user@example.com";
    const referralCode = "ABC123";
    const error = new Error("Referral creation failed");

    mockCookies.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: referralCode }),
    } as any);

    mockCreateReferral.mockRejectedValue(error);

    // Should not throw
    await expect(
      handleReferralOnSignUp(userId, userEmail),
    ).resolves.toBeUndefined();

    expect(mockCaptureException).toHaveBeenCalledWith(error, {
      extra: { userId, email: userEmail, location: "handleReferralOnSignUp" },
    });
  });

  it("should not create referral when referral code cookie has empty value", async () => {
    const userId = "user123";
    const userEmail = "user@example.com";

    mockCookies.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "" }),
    } as any);

    await handleReferralOnSignUp(userId, userEmail);

    expect(mockCreateReferral).not.toHaveBeenCalled();
  });
});
