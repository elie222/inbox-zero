import { describe, expect, it, vi } from "vitest";
import { ApiClient, buildApiUrl, normalizeBaseUrl } from "./client";

describe("normalizeBaseUrl", () => {
  it("appends the API path when given a site origin", () => {
    expect(normalizeBaseUrl("https://www.getinboxzero.com")).toBe(
      "https://www.getinboxzero.com/api/v1",
    );
  });

  it("keeps an existing api/v1 base URL unchanged", () => {
    expect(normalizeBaseUrl("https://www.getinboxzero.com/api/v1")).toBe(
      "https://www.getinboxzero.com/api/v1",
    );
  });

  it("keeps a subpath api/v1 base URL unchanged", () => {
    expect(normalizeBaseUrl("https://example.com/sub/api/v1")).toBe(
      "https://example.com/sub/api/v1",
    );
  });

  it("appends api/v1 to custom deployment paths", () => {
    expect(normalizeBaseUrl("https://example.com/inbox-zero")).toBe(
      "https://example.com/inbox-zero/api/v1",
    );
  });
});

describe("buildApiUrl", () => {
  it("joins the base URL, path, and query params", () => {
    expect(
      buildApiUrl("https://www.getinboxzero.com", "/stats/by-period", {
        period: "week",
        fromDate: "123",
      }),
    ).toBe(
      "https://www.getinboxzero.com/api/v1/stats/by-period?period=week&fromDate=123",
    );
  });

  it("keeps empty-string query values", () => {
    expect(
      buildApiUrl("https://www.getinboxzero.com", "/stats/by-period", {
        fromDate: "",
      }),
    ).toBe("https://www.getinboxzero.com/api/v1/stats/by-period?fromDate=");
  });
});

describe("ApiClient errors", () => {
  it("reads nested public API error messages", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "UNAUTHORIZED",
            message: "Missing API key",
            hint: "Include a valid API-Key header.",
          },
        }),
        { status: 401 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiClient({
      apiKey: "test-key",
      baseUrl: "https://www.getinboxzero.com",
    });

    await expect(client.get("/rules")).rejects.toThrow("Missing API key");
    vi.unstubAllGlobals();
  });
});
