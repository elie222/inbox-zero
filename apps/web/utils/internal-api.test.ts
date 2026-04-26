import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadInternalApiModule({
  nextPublicBaseUrl = "https://mail.example.com",
  internalApiUrl = "https://www.getinboxzero.com",
  internalApiKey = "expected-internal-key",
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
      "x-api-key": "expected-internal-key",
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
});
