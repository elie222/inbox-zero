import { describe, it, expect, vi, afterEach } from "vitest";
import {
  generateSignedOAuthState,
  parseSignedOAuthState,
  validateSignedOAuthState,
} from "./state";

describe("signed OAuth state", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips valid signed state", () => {
    const state = generateSignedOAuthState({
      emailAccountId: "acc_123",
      type: "slack" as const,
    });

    const parsed = parseSignedOAuthState<{
      emailAccountId: string;
      type: "slack";
    }>(state);

    expect(parsed.emailAccountId).toBe("acc_123");
    expect(parsed.type).toBe("slack");
    expect(parsed.nonce.length).toBeGreaterThanOrEqual(8);
    expect(typeof parsed.issuedAt).toBe("number");
  });

  it("rejects state with tampered signature", () => {
    const state = generateSignedOAuthState({
      emailAccountId: "acc_123",
      type: "slack" as const,
    });
    const [payload, signature] = state.split(".");
    const tamperedSignature = `${signature.slice(0, -1)}${signature.endsWith("a") ? "b" : "a"}`;
    const tamperedState = `${payload}.${tamperedSignature}`;

    expect(() =>
      parseSignedOAuthState<{ emailAccountId: string; type: "slack" }>(
        tamperedState,
      ),
    ).toThrow("Invalid OAuth state signature");
  });

  it("rejects expired state", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-08T12:00:00.000Z"));

    const state = generateSignedOAuthState({
      emailAccountId: "acc_123",
      type: "slack" as const,
      issuedAt: Date.now() - 11 * 60 * 1000,
    });

    expect(() =>
      parseSignedOAuthState<{ emailAccountId: string; type: "slack" }>(state),
    ).toThrow("OAuth state expired");
  });

  it("validates matching signed state values", () => {
    const state = generateSignedOAuthState({
      emailAccountId: "acc_123",
      type: "slack" as const,
    });

    const result = validateSignedOAuthState<{
      emailAccountId: string;
      type: "slack";
    }>({
      receivedState: state,
      storedState: state,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.state.emailAccountId).toBe("acc_123");
      expect(result.state.type).toBe("slack");
    }
  });

  it("rejects mismatched signed state values", () => {
    const storedState = generateSignedOAuthState({
      emailAccountId: "acc_123",
      type: "slack" as const,
    });
    const receivedState = generateSignedOAuthState({
      emailAccountId: "acc_123",
      type: "slack" as const,
    });

    const result = validateSignedOAuthState<{
      emailAccountId: string;
      type: "slack";
    }>({
      receivedState,
      storedState,
    });

    expect(result).toEqual({
      success: false,
      error: "invalid_state",
    });
  });

  it("rejects malformed signed state values", () => {
    const unsignedState = Buffer.from(
      JSON.stringify({
        emailAccountId: "acc_123",
        type: "slack",
        nonce: "12345678",
      }),
    ).toString("base64url");

    const result = validateSignedOAuthState<{
      emailAccountId: string;
      type: "slack";
    }>({
      receivedState: unsignedState,
      storedState: unsignedState,
    });

    expect(result).toEqual({
      success: false,
      error: "invalid_state_format",
    });
  });
});
