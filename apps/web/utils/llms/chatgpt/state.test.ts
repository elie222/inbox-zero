import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeChatGptState, encodeChatGptState } from "./state";

vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "test",
    EMAIL_ENCRYPT_SECRET: "test-secret-key-for-encryption-testing",
    EMAIL_ENCRYPT_SALT: "test-salt-for-encryption",
  },
}));

const STATE = {
  clientId: null,
  codeVerifier: "verifier",
  nonce: "nonce",
  redirectUri: "http://127.0.0.1:3001/auth/callback",
  userId: "user-1",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("ChatGPT OAuth state", () => {
  it("round-trips the sign-in attempt", () => {
    expect(decodeChatGptState(encodeChatGptState(STATE))).toEqual(STATE);
  });

  it("rejects tampered, plaintext, and missing state", () => {
    const encoded = encodeChatGptState(STATE);
    const tampered = `${encoded.slice(0, -2)}${encoded.endsWith("00") ? "11" : "00"}`;

    expect(decodeChatGptState(tampered)).toBeNull();
    expect(decodeChatGptState(JSON.stringify(STATE))).toBeNull();
    expect(decodeChatGptState(null)).toBeNull();
  });

  it("expires after ten minutes", () => {
    vi.useFakeTimers();
    const encoded = encodeChatGptState(STATE);
    vi.advanceTimersByTime(11 * 60 * 1000);

    expect(decodeChatGptState(encoded)).toBeNull();
  });
});
