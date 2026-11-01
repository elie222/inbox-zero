import { describe, expect, it } from "vitest";
import {
  isAllowedMicrosoftGraphPageToken,
  isNonAdvancingOutlookNextLink,
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

  it("allows Microsoft Graph canary next links", () => {
    expect(
      isAllowedMicrosoftGraphPageToken(
        "https://canary.graph.microsoft.com/v1.0/me/messages?$skiptoken=abc",
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

  it("rejects tokens with embedded URLs", () => {
    expect(
      isAllowedMicrosoftGraphPageToken(
        "token-prefix-https://169.254.169.254/latest",
      ),
    ).toBe(false);
  });
});

describe("resolveMicrosoftGraphNextLink", () => {
  it("returns the URL for allowed Microsoft Graph next links", () => {
    const pageToken =
      "https://graph.microsoft.com/v1.0/me/messages?$skiptoken=abc";

    expect(resolveMicrosoftGraphNextLink(pageToken)).toBe(pageToken);
  });

  it("resolves relative Graph continuation links instead of restarting page one", () => {
    const pageToken = "/v1.0/me/mailFolders/inbox/messages?%24skip=20";
    expect(resolveMicrosoftGraphNextLink(pageToken)).toBe(
      `https://graph.microsoft.com${pageToken}`,
    );
  });

  it("rejects relative-looking links that contain an embedded external URL", () => {
    expect(() =>
      resolveMicrosoftGraphNextLink("/v1.0/https://169.254.169.254/latest"),
    ).toThrow("Invalid Outlook page token");
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

describe("isNonAdvancingOutlookNextLink", () => {
  it("treats null or empty candidate link as non-advancing", () => {
    expect(
      isNonAdvancingOutlookNextLink(
        "https://graph.microsoft.com/v1.0/me/messages",
        null,
      ),
    ).toBe(true);
    expect(
      isNonAdvancingOutlookNextLink(
        "https://graph.microsoft.com/v1.0/me/messages",
        undefined,
      ),
    ).toBe(true);
  });

  it("treats initial candidate link with no current link as advancing", () => {
    expect(
      isNonAdvancingOutlookNextLink(
        null,
        "https://graph.microsoft.com/v1.0/me/messages?$skip=20",
      ),
    ).toBe(false);
  });

  it("detects identical URLs as non-advancing", () => {
    const url =
      "https://graph.microsoft.com/v1.0/me/mailFolders/archive/messages?$skip=200";
    expect(isNonAdvancingOutlookNextLink(url, url)).toBe(true);
  });

  it("detects candidate with same or lower $skip offset as non-advancing", () => {
    const current = "https://graph.microsoft.com/v1.0/me/messages?$skip=40";
    const sameSkip = "https://graph.microsoft.com/v1.0/me/messages?$skip=40";
    const lowerSkip = "https://graph.microsoft.com/v1.0/me/messages?$skip=20";

    expect(isNonAdvancingOutlookNextLink(current, sameSkip)).toBe(true);
    expect(isNonAdvancingOutlookNextLink(current, lowerSkip)).toBe(true);
  });

  it("allows candidate with higher $skip offset to advance", () => {
    const current = "https://graph.microsoft.com/v1.0/me/messages?$skip=20";
    const next = "https://graph.microsoft.com/v1.0/me/messages?$skip=40";

    expect(isNonAdvancingOutlookNextLink(current, next)).toBe(false);
  });

  it("detects identical $skiptoken parameters as non-advancing", () => {
    const current =
      "https://graph.microsoft.com/v1.0/me/messages?$skiptoken=token_abc";
    const sameToken =
      "https://graph.microsoft.com/v1.0/me/messages?$skiptoken=token_abc";
    const nextToken =
      "https://graph.microsoft.com/v1.0/me/messages?$skiptoken=token_xyz";

    expect(isNonAdvancingOutlookNextLink(current, sameToken)).toBe(true);
    expect(isNonAdvancingOutlookNextLink(current, nextToken)).toBe(false);
  });
});
