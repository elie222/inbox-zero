import { describe, it, expect, vi, afterEach } from "vitest";
import { generateSignedOAuthState, parseSignedOAuthState } from "./state";

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
});
