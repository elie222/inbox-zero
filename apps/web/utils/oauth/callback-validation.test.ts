import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateOAuthCallback } from "./callback-validation";
import { createScopedLogger } from "@/utils/logger";
import { parseOAuthState } from "@/utils/oauth/state";

const logger = createScopedLogger("test");

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
      baseUrl: "http://localhost:3000",
      logger,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const url = new URL(result.response.headers.get("location") || "");
      expect(url.searchParams.get("error")).toBe("invalid_state");
    }
  });

  it("should return error when code is missing", () => {
    vi.mocked(parseOAuthState).mockReturnValue({
      userId: "user-id",
      nonce: "nonce",
    });

    const result = validateOAuthCallback({
      code: null,
      receivedState: "state",
      storedState: "state",
      stateCookieName: "test_cookie",
      baseUrl: "http://localhost:3000",
      logger,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const url = new URL(result.response.headers.get("location") || "");
      expect(url.searchParams.get("error")).toBe("missing_code");
    }
  });

  it("should return error when state decode fails", () => {
    vi.mocked(parseOAuthState).mockImplementation(() => {
      throw new Error("Invalid state");
    });

    const result = validateOAuthCallback({
      code: "valid-code",
      receivedState: "state",
      storedState: "state",
      stateCookieName: "test_cookie",
      baseUrl: "http://localhost:3000",
      logger,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const url = new URL(result.response.headers.get("location") || "");
      expect(url.searchParams.get("error")).toBe("invalid_state_format");
    }
  });

  it("should return success when validation passes", () => {
    vi.mocked(parseOAuthState).mockReturnValue({
      userId: "user-id",
      action: "auto",
      nonce: "nonce",
    });

    const result = validateOAuthCallback({
      code: "valid-code",
      receivedState: "state",
      storedState: "state",
      stateCookieName: "test_cookie",
      baseUrl: "http://localhost:3000",
      logger,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.targetUserId).toBe("user-id");
      expect(result.code).toBe("valid-code");
    }
  });
});
