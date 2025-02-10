import { describe, it, expect, vi, beforeEach } from "vitest";
import { hasCronSecret } from "./cron";

vi.mock("server-only", () => ({}));

vi.mock("@/env", () => ({
  env: { CRON_SECRET: "test-secret-123" },
}));

vi.mock("@/utils/logger", () => ({
  createScopedLogger: () => ({ error: vi.fn() }),
}));

describe("hasCronSecret", () => {
  let request: Request;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return true for valid authorization header", () => {
    request = new Request("https://example.com", {
      headers: {
        authorization: "Bearer test-secret-123",
      },
    });

    expect(hasCronSecret(request)).toBe(true);
  });

  it("should return false for invalid authorization header", () => {
    request = new Request("https://example.com", {
      headers: {
        authorization: "Bearer wrong-secret",
      },
    });

    expect(hasCronSecret(request)).toBe(false);
  });

  it("should return false for missing authorization header", () => {
    request = new Request("https://example.com");

    expect(hasCronSecret(request)).toBe(false);
  });

  it("should return false for malformed authorization header", () => {
    request = new Request("https://example.com", {
      headers: {
        authorization: "test-secret-123", // Missing "Bearer" prefix
      },
    });

    expect(hasCronSecret(request)).toBe(false);
  });
});
