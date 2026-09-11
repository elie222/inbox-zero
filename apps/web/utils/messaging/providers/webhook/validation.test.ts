import { afterEach, describe, expect, it, vi } from "vitest";
import { assertDigestWebhookUrl } from "./validation";

afterEach(() => vi.unstubAllEnvs());

describe("assertDigestWebhookUrl", () => {
  it("requires HTTPS even without a secret", () => {
    expect(() => assertDigestWebhookUrl("http://example.com/hook")).toThrow(
      /HTTPS/,
    );
  });

  it("accepts public HTTPS endpoints", () => {
    expect(() =>
      assertDigestWebhookUrl("https://example.com/hook"),
    ).not.toThrow();
  });

  it("rejects private targets unless the operator opts in", () => {
    vi.stubEnv("WEBHOOK_ALLOW_PRIVATE_IPS", "false");
    expect(() => assertDigestWebhookUrl("https://192.168.1.10/hook")).toThrow();
    vi.stubEnv("WEBHOOK_ALLOW_PRIVATE_IPS", "true");
    expect(() =>
      assertDigestWebhookUrl("https://192.168.1.10/hook"),
    ).not.toThrow();
  });

  it("still blocks metadata hostnames with private targets enabled", () => {
    vi.stubEnv("WEBHOOK_ALLOW_PRIVATE_IPS", "true");
    expect(() =>
      assertDigestWebhookUrl("https://metadata.google.internal/hook"),
    ).toThrow();
  });

  it("rejects credentials embedded in URLs", () => {
    expect(() =>
      assertDigestWebhookUrl("https://user:password@example.com/hook"),
    ).toThrow(/secret field/);
  });
});
