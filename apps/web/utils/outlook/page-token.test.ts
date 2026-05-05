import { describe, expect, it } from "vitest";
import {
  isAllowedMicrosoftGraphPageToken,
  resolveMicrosoftGraphNextLink,
} from "@/utils/outlook/page-token";

describe("isAllowedMicrosoftGraphPageToken", () => {
  it("allows opaque continuation tokens", () => {
    expect(isAllowedMicrosoftGraphPageToken("page-token-1")).toBe(true);
  });

  it("allows Microsoft Graph next links", () => {
    expect(
      isAllowedMicrosoftGraphPageToken(
        "https://graph.microsoft.com/v1.0/me/messages?$skiptoken=abc",
      ),
    ).toBe(true);
  });

  it("allows Microsoft Graph national cloud next links", () => {
    expect(
      isAllowedMicrosoftGraphPageToken(
        "https://microsoftgraph.chinacloudapi.cn/v1.0/me/messages?$skiptoken=abc",
      ),
    ).toBe(true);
  });

  it("rejects non-Graph hosts", () => {
    expect(
      isAllowedMicrosoftGraphPageToken(
        "https://graph.microsoft.com.example.com/v1.0/me/messages",
      ),
    ).toBe(false);
  });

  it("rejects non-https Graph URLs", () => {
    expect(
      isAllowedMicrosoftGraphPageToken(
        "http://graph.microsoft.com/v1.0/me/messages?$skiptoken=abc",
      ),
    ).toBe(false);
  });

  it("rejects protocol-relative URLs", () => {
    expect(isAllowedMicrosoftGraphPageToken("//169.254.169.254/latest")).toBe(
      false,
    );
  });
});

describe("resolveMicrosoftGraphNextLink", () => {
  it("returns the URL for allowed Microsoft Graph next links", () => {
    const pageToken =
      "https://graph.microsoft.com/v1.0/me/messages?$skiptoken=abc";

    expect(resolveMicrosoftGraphNextLink(pageToken)).toBe(pageToken);
  });

  it("returns null for opaque tokens", () => {
    expect(resolveMicrosoftGraphNextLink("page-token-1")).toBeNull();
  });

  it("returns null for nullish tokens", () => {
    expect(resolveMicrosoftGraphNextLink(null)).toBeNull();
    expect(resolveMicrosoftGraphNextLink(undefined)).toBeNull();
  });

  it("throws for absolute URLs outside Microsoft Graph", () => {
    expect(() =>
      resolveMicrosoftGraphNextLink("http://169.254.169.254/latest/meta-data"),
    ).toThrow("Invalid Outlook page token");
  });
});
