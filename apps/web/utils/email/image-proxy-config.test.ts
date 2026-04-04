import { describe, expect, it } from "vitest";
import { getImageProxyBaseUrl } from "./image-proxy-config";

describe("getImageProxyBaseUrl", () => {
  it("returns the app route when app proxy mode is enabled", () => {
    expect(
      getImageProxyBaseUrl({
        baseUrl: "https://app.example.com",
        useAppRoute: true,
      }),
    ).toBe("https://app.example.com/api/image-proxy");
  });

  it("fails closed when the app base URL is invalid", () => {
    expect(
      getImageProxyBaseUrl({
        baseUrl: "not a url",
        useAppRoute: true,
      }),
    ).toBeNull();
  });
});
