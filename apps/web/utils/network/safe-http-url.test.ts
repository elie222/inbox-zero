import * as dns from "node:dns/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isSafeExternalHttpUrl,
  resolveSafeExternalHttpUrl,
} from "./safe-http-url";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

describe("isSafeExternalHttpUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("rejects hostnames that resolve to private IP addresses", async () => {
    vi.mocked(dns.lookup).mockResolvedValue([
      { address: "10.0.0.8", family: 4 },
    ] as Awaited<ReturnType<typeof dns.lookup>>);

    await expect(
      resolveSafeExternalHttpUrl("https://news.example.com/unsubscribe"),
    ).resolves.toBeNull();
  });

  it("rejects hostnames that resolve to private IPv6 addresses", async () => {
    vi.mocked(dns.lookup).mockResolvedValue([
      { address: "fd00::8", family: 6 },
    ] as Awaited<ReturnType<typeof dns.lookup>>);

    await expect(
      resolveSafeExternalHttpUrl("https://news.example.com/unsubscribe"),
    ).resolves.toBeNull();
  });

  it("surfaces DNS lookup failures", async () => {
    const error = Object.assign(new Error("temporary failure"), {
      code: "EAI_AGAIN",
    });
    vi.mocked(dns.lookup).mockRejectedValue(error);

    await expect(
      resolveSafeExternalHttpUrl("https://news.example.com/unsubscribe"),
    ).rejects.toMatchObject({
      code: "EAI_AGAIN",
    });
  });

  it("returns a pinned DNS lookup for public hostnames", async () => {
    vi.mocked(dns.lookup).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as Awaited<ReturnType<typeof dns.lookup>>);

    const resolved = await resolveSafeExternalHttpUrl(
      "https://news.example.com/unsubscribe",
    );

    expect(resolved).not.toBeNull();
    expect(dns.lookup).toHaveBeenCalledWith("news.example.com", {
      all: true,
      verbatim: true,
    });

    const lookupResult = await new Promise<{ address: string; family: number }>(
      (resolve, reject) => {
        resolved?.lookup(
          "news.example.com",
          { all: false, family: 0, hints: 0 },
          (error, address, family) => {
            if (error) return reject(error);
            if (!address || !family) {
              return reject(new Error("Expected a resolved address"));
            }
            resolve({ address, family });
          },
        );
      },
    );

    expect(lookupResult).toEqual({
      address: "93.184.216.34",
      family: 4,
    });
  });
});
