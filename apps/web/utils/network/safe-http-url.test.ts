import { describe, expect, it } from "vitest";
import { isSafeExternalHttpUrl } from "./safe-http-url";

describe("isSafeExternalHttpUrl", () => {
  it("allows public HTTPS hostnames", () => {
    expect(isSafeExternalHttpUrl("https://example.com/unsubscribe")).toBe(true);
  });

  it("rejects localhost hostnames", () => {
    expect(isSafeExternalHttpUrl("https://localhost/unsubscribe")).toBe(false);
    expect(isSafeExternalHttpUrl("https://localhost./unsubscribe")).toBe(false);
    expect(
      isSafeExternalHttpUrl("https://newsletter.localhost/unsubscribe"),
    ).toBe(false);
  });

  it("rejects private IPv4 addresses", () => {
    expect(isSafeExternalHttpUrl("http://127.0.0.1/unsubscribe")).toBe(false);
    expect(isSafeExternalHttpUrl("http://10.0.0.1/unsubscribe")).toBe(false);
  });

  it("allows public bracketed IPv6 hostnames", () => {
    expect(
      isSafeExternalHttpUrl("https://[2001:4860:4860::8888]/unsubscribe"),
    ).toBe(true);
  });

  it("rejects private IPv4-mapped IPv6 addresses", () => {
    expect(isSafeExternalHttpUrl("http://[::ffff:127.0.0.1]/unsubscribe")).toBe(
      false,
    );
    expect(isSafeExternalHttpUrl("http://[::ffff:c0a8:1]/unsubscribe")).toBe(
      false,
    );
  });

  it("allows public IPv4-mapped IPv6 addresses", () => {
    expect(isSafeExternalHttpUrl("https://[::ffff:808:808]/unsubscribe")).toBe(
      true,
    );
  });
});
