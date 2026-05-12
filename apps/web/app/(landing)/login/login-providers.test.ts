import { describe, expect, it } from "vitest";
import { getEnabledLoginProviders } from "./login-providers";

describe("getEnabledLoginProviders", () => {
  it("returns all providers when env var is undefined", () => {
    const result = getEnabledLoginProviders(undefined);
    expect(result.has("google")).toBe(true);
    expect(result.has("microsoft")).toBe(true);
    expect(result.has("apple")).toBe(true);
    expect(result.has("sso")).toBe(true);
  });

  it("returns all providers when env var is empty string", () => {
    const result = getEnabledLoginProviders("");
    expect(result.size).toBe(4);
  });

  it("returns all providers when env var is whitespace only", () => {
    const result = getEnabledLoginProviders("   ");
    expect(result.size).toBe(4);
  });

  it("narrows to a single provider", () => {
    const result = getEnabledLoginProviders("sso");
    expect(result.has("sso")).toBe(true);
    expect(result.has("google")).toBe(false);
    expect(result.has("microsoft")).toBe(false);
    expect(result.has("apple")).toBe(false);
  });

  it("parses comma-separated values and trims whitespace", () => {
    const result = getEnabledLoginProviders("google, microsoft");
    expect(result.has("google")).toBe(true);
    expect(result.has("microsoft")).toBe(true);
    expect(result.has("sso")).toBe(false);
    expect(result.has("apple")).toBe(false);
  });

  it("is case-insensitive", () => {
    const result = getEnabledLoginProviders("GOOGLE,Microsoft,SsO");
    expect(result.has("google")).toBe(true);
    expect(result.has("microsoft")).toBe(true);
    expect(result.has("sso")).toBe(true);
  });

  it("ignores unknown tokens", () => {
    const result = getEnabledLoginProviders("google,nonsense,facebook");
    expect(result.has("google")).toBe(true);
    expect(result.size).toBe(1);
  });

  it("falls back to all providers when all tokens are unknown (avoids lockout)", () => {
    const result = getEnabledLoginProviders("facebook,twitter");
    expect(result.size).toBe(4);
  });
});
