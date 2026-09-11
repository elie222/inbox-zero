import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  APPLE_CLIENT_ID: "com.example.app",
  APPLE_TEAM_ID: "TEAMID1234",
  APPLE_KEY_ID: "KEYID1234",
  APPLE_PRIVATE_KEY: "",
}));

vi.mock("@/env", () => ({
  env: mockEnv,
}));

describe("getAppleClientSecret", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    mockEnv.APPLE_CLIENT_ID = "com.example.app";
    mockEnv.APPLE_TEAM_ID = "TEAMID1234";
    mockEnv.APPLE_KEY_ID = "KEYID1234";
    mockEnv.APPLE_PRIVATE_KEY = createPrivateKeyPem();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when Apple OAuth credentials are missing", async () => {
    mockEnv.APPLE_PRIVATE_KEY = "";

    const { getAppleClientSecret } = await import("./apple-client-secret");

    expect(getAppleClientSecret()).toBeNull();
  });

  it("reuses the cached secret before the refresh buffer", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    vi.setSystemTime(now);

    const { getAppleClientSecret } = await import("./apple-client-secret");

    const firstSecret = getAppleClientSecret();
    vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));
    const secondSecret = getAppleClientSecret();

    expect(secondSecret).toBe(firstSecret);
  });

  it("refreshes the cached secret one day before Apple would expire it", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    vi.setSystemTime(now);

    const { appleClientSecretTtlSeconds, getAppleClientSecret } = await import(
      "./apple-client-secret"
    );

    const firstSecret = getAppleClientSecret();
    expect(firstSecret).not.toBeNull();
    const firstPayload = decodeJwtPayload(firstSecret!);

    vi.setSystemTime(new Date("2026-06-29T00:00:00Z"));
    const refreshedSecret = getAppleClientSecret();

    expect(refreshedSecret).not.toBe(firstSecret);
    const refreshedPayload = decodeJwtPayload(refreshedSecret!);
    expect(refreshedPayload.iat).toBe(Math.floor(Date.now() / 1000));
    expect(refreshedPayload.exp).toBe(
      refreshedPayload.iat + appleClientSecretTtlSeconds,
    );
    expect(refreshedPayload.iat).toBeGreaterThan(firstPayload.iat);
  });
});

function createPrivateKeyPem() {
  const { privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });

  return privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString()
    .replace(/\n/g, "\\n");
}

function decodeJwtPayload(token: string) {
  const [, payload] = token.split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    iat: number;
    exp: number;
  };
}
