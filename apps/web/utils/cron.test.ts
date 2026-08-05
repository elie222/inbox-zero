import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasCronSecret, isAuthorizedCronOrInternalRequest } from "./cron";
import type { RequestWithLogger } from "@/utils/middleware";
import { createTestLogger } from "@/__tests__/helpers";

const logger = createTestLogger();

vi.mock("@/env", () => ({
  env: { CRON_SECRET: "test-secret-123", INTERNAL_API_KEY: "test-api-key" },
}));

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

  afterEach(() => {
    vi.restoreAllMocks();
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

describe("isAuthorizedCronOrInternalRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts an internal API key without logging a failed cron check", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const request = createMockRequestWithLogger({
      "x-api-key": "test-api-key",
    });

    expect(isAuthorizedCronOrInternalRequest(request)).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("accepts a valid cron secret", () => {
    const request = createMockRequestWithLogger({
      authorization: "Bearer test-secret-123",
    });

    expect(isAuthorizedCronOrInternalRequest(request)).toBe(true);
  });

  it("rejects and logs a request with neither credential", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const request = createMockRequestWithLogger();

    expect(isAuthorizedCronOrInternalRequest(request)).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });
});
