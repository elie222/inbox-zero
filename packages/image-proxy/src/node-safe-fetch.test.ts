import { lookup } from "node:dns/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSafeImageProxyFetch,
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

  it("rejects 6to4 IPv6 addresses that tunnel private IPv4 space", () => {
    expect(isSafeExternalHttpUrl("http://[2002:0a00:0001::1]/photo.png")).toBe(
      false,
    );
  });

  it("rejects hostnames that resolve to private IP addresses", async () => {
    vi.mocked(lookup).mockResolvedValue([
      { address: "10.0.0.8", family: 4 },
    ] as Awaited<ReturnType<typeof lookup>>);

    await expect(
      resolveSafeExternalHttpUrl("https://news.example.com/photo.png"),
    ).resolves.toBeNull();
  });

  it("returns a pinned DNS lookup for public hostnames", async () => {
    vi.mocked(lookup).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as Awaited<ReturnType<typeof lookup>>);

    const resolved = await resolveSafeExternalHttpUrl(
      "https://news.example.com/photo.png",
    );

    expect(resolved).not.toBeNull();
    expect(lookup).toHaveBeenCalledWith("news.example.com", {
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

  it("returns 502 when DNS resolution fails during fetch setup", async () => {
    vi.mocked(lookup).mockRejectedValue(
      Object.assign(new Error("temporary failure"), {
        code: "EAI_AGAIN",
      }),
    );

    const response = await createSafeImageProxyFetch(
      "https://news.example.com/photo.png",
    );

    expect(response.status).toBe(502);
    await expect(response.text()).resolves.toBe("Upstream host lookup failed");
  });
});
