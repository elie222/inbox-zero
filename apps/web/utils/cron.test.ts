import { describe, it, expect, vi, beforeEach } from "vitest";
import { hasCronSecret } from "./cron";
import type { RequestWithLogger } from "@/utils/middleware";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("test");

vi.mock("server-only", () => ({}));

vi.mock("@/env", () => ({ env: { CRON_SECRET: "test-secret-123" } }));

function createMockRequestWithLogger(
  headers?: Record<string, string>,
): RequestWithLogger {
  const request = new Request("https://example.com", {
    headers: headers ? new Headers(headers) : undefined,
  });
  return {
    ...request,
    headers: request.headers,
    logger,
  } as RequestWithLogger;
}

describe("hasCronSecret", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return true for valid authorization header", () => {
    const request = createMockRequestWithLogger({
      authorization: "Bearer test-secret-123",
    });

    expect(hasCronSecret(request)).toBe(true);
  });

  it("should return false for invalid authorization header", () => {
    const request = createMockRequestWithLogger({
      authorization: "Bearer wrong-secret",
    });

    expect(hasCronSecret(request)).toBe(false);
  });

  it("should return false for missing authorization header", () => {
    const request = createMockRequestWithLogger();

    expect(hasCronSecret(request)).toBe(false);
  });

  it("should return false for malformed authorization header", () => {
    const request = createMockRequestWithLogger({
      authorization: "test-secret-123", // Missing "Bearer" prefix
    });

    expect(hasCronSecret(request)).toBe(false);
  });
});
