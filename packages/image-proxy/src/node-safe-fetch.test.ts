import * as dns from "node:dns/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isSafeExternalHttpUrl,
  resolveSafeExternalHttpUrl,
} from "./node-safe-fetch";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

describe("isSafeExternalHttpUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows public HTTPS hostnames", () => {
    expect(isSafeExternalHttpUrl("https://example.com/photo.png")).toBe(true);
  });

  it("rejects localhost variants with trailing dots", () => {
    expect(isSafeExternalHttpUrl("https://localhost/photo.png")).toBe(false);
    expect(isSafeExternalHttpUrl("https://localhost./photo.png")).toBe(false);
    expect(isSafeExternalHttpUrl("https://cdn.localhost./photo.png")).toBe(
      false,
    );
  });

  it("rejects hostnames without a public suffix", () => {
    expect(isSafeExternalHttpUrl("https://printer/photo.png")).toBe(false);
  });

  it("rejects private IPv4-mapped IPv6 addresses", () => {
    expect(isSafeExternalHttpUrl("http://[::ffff:127.0.0.1]/photo.png")).toBe(
      false,
    );
  });

  it("rejects hostnames that resolve to private IP addresses", async () => {
    vi.mocked(dns.lookup).mockResolvedValue([
      { address: "10.0.0.8", family: 4 },
    ] as Awaited<ReturnType<typeof dns.lookup>>);

    await expect(
      resolveSafeExternalHttpUrl("https://news.example.com/photo.png"),
    ).resolves.toBeNull();
  });

  it("returns a pinned DNS lookup for public hostnames", async () => {
    vi.mocked(dns.lookup).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as Awaited<ReturnType<typeof dns.lookup>>);

    const resolved = await resolveSafeExternalHttpUrl(
      "https://news.example.com/photo.png",
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
