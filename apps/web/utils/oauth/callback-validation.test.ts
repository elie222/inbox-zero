import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateOAuthCallback } from "./callback-validation";
import { parseSignedOAuthState } from "@/utils/oauth/state";
import { createTestLogger } from "@/__tests__/helpers";

const logger = createTestLogger();

vi.mock("@/utils/oauth/state");

describe("validateOAuthCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return error when state mismatch", () => {
    const result = validateOAuthCallback({
      code: "valid-code",
      receivedState: "received-state",
      storedState: "different-stored-state",
      stateCookieName: "test_cookie",
      logger,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const url = new URL(result.response.headers.get("location") || "");
      expect(url.searchParams.get("error")).toBe("invalid_state");
    }
  });

  it("should return error when code is missing", () => {
    vi.mocked(parseSignedOAuthState).mockReturnValue({
      userId: "user-id",
      nonce: "nonce",
      issuedAt: Date.now(),
    });

    const result = validateOAuthCallback({
      code: null,
      receivedState: "state",
      storedState: "state",
      stateCookieName: "test_cookie",
      logger,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const url = new URL(result.response.headers.get("location") || "");
      expect(url.searchParams.get("error")).toBe("missing_code");
    }
  });

  it("should return error when state decode fails", () => {
    vi.mocked(parseSignedOAuthState).mockImplementation(() => {
      throw new Error("Invalid state");
    });

    const result = validateOAuthCallback({
      code: "valid-code",
      receivedState: "state",
      storedState: "state",
      stateCookieName: "test_cookie",
      logger,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const url = new URL(result.response.headers.get("location") || "");
      expect(url.searchParams.get("error")).toBe("invalid_state_format");
    }
  });

  it("should return success when validation passes", () => {
    vi.mocked(parseSignedOAuthState).mockReturnValueOnce({
      userId: "user-id",
      nonce: "nonce",
      issuedAt: 123,
    });

    const result = validateOAuthCallback({
      code: "valid-code",
      receivedState: "matching-state",
      storedState: "matching-state",
      stateCookieName: "test_cookie",
      logger,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.targetUserId).toBe("user-id");
      expect(result.stateNonce).toBe("nonce");
      expect(result.code).toBe("valid-code");
    }
  });
});
