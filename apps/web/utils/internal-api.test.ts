import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// isValidInternalApiKey rejects anything under 32 characters before it even
// compares, so the fixture key has to be a realistic length
const VALID_INTERNAL_API_KEY = "expected-internal-key-0123456789ab";

async function loadInternalApiModule({
  nextPublicBaseUrl = "https://mail.example.com",
  internalApiUrl = "https://www.getinboxzero.com",
  internalApiKey = VALID_INTERNAL_API_KEY,
}: {
  nextPublicBaseUrl?: string;
  internalApiUrl?: string;
  internalApiKey?: string;
} = {}) {
  vi.resetModules();

  vi.doMock("@/env", () => ({
    env: {
      AXIOM_TOKEN: undefined,
      EMAIL_ENCRYPT_SALT: "test-email-encrypt-salt",
      ENABLE_DEBUG_LOGS: false,
      INTERNAL_API_KEY: internalApiKey,
      INTERNAL_API_URL: internalApiUrl,
      NEXT_PUBLIC_BASE_URL: nextPublicBaseUrl,
      NEXT_PUBLIC_LOG_SCOPES: undefined,
      NODE_ENV: "production",
    },
  }));

  const [{ createScopedLogger }, internalApi, { hash }] = await Promise.all([
    import("./logger"),
    import("./internal-api"),
    import("./hash"),
  ]);

  return { createScopedLogger, hash, ...internalApi };
}

describe("internal-api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("includes a compact caller identity for self-hosted callers", async () => {
    const { getInternalApiHeaders } = await loadInternalApiModule({
      nextPublicBaseUrl: "https://mail.example.com",
      internalApiUrl: "https://www.getinboxzero.com",
    });

    const headers = getInternalApiHeaders();

    expect(headers).toMatchObject({
      "x-api-key": VALID_INTERNAL_API_KEY,
      "x-inbox-zero-caller-id": "mail.example.com",
      "x-inbox-zero-caller-app": "inbox-zero-web",
      "x-inbox-zero-caller-runtime": "self-hosted",
      "x-inbox-zero-caller-base-url-host": "mail.example.com",
    });
    expect(headers).not.toHaveProperty("x-inbox-zero-caller-fingerprint");
  });

  it("logs a hashed invalid key together with caller metadata", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_URL", "self-hosted-preview.example.com");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "commit_123");
    vi.stubEnv("VERCEL_GIT_PROVIDER", "github");
    vi.stubEnv("VERCEL_GIT_REPO_OWNER", "acme");
    vi.stubEnv("VERCEL_GIT_REPO_SLUG", "inbox-zero-fork");

    const {
      createScopedLogger,
      getInternalApiHeaders,
      hash,
      isValidInternalApiKey,
    } = await loadInternalApiModule();

    const headers = new Headers(getInternalApiHeaders());
    headers.set("x-api-key", "wrong-internal-key");

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = createScopedLogger("internal-api-test");

    expect(isValidInternalApiKey(headers, logger)).toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    const [message] = errorSpy.mock.calls[0];
    const logLine = String(message);

    expect(logLine).toContain(
      `"invalidApiKeyHash": "${hash("wrong-internal-key")}"`,
    );
    expect(logLine).not.toContain("wrong-internal-key");
    expect(logLine).toContain('"callerId": "mail.example.com"');
    expect(logLine).toContain('"callerRuntime": "vercel"');
    expect(logLine).toContain('"callerRepo": "github:acme/inbox-zero-fork"');
    expect(logLine).toContain(
      '"callerDeploymentUrl": "self-hosted-preview.example.com"',
    );
    expect(logLine).toContain('"callerGitCommit": "commit_123"');
  });

  // A short key is brute-forceable and these routes mutate arbitrary
  // mailboxes, so a weak deployment must fail closed rather than accept it
  it("rejects every request when the configured key is too short", async () => {
    const { createScopedLogger, getInternalApiHeaders, isValidInternalApiKey } =
      await loadInternalApiModule({ internalApiKey: "short-key" });

    const headers = new Headers(getInternalApiHeaders());
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(
      isValidInternalApiKey(headers, createScopedLogger("internal-api-test")),
    ).toBe(false);
  });
});
