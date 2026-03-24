import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: {
    GOOGLE_BASE_URL: undefined,
    GOOGLE_CLIENT_ID: "client-id",
    GOOGLE_CLIENT_SECRET: "client-secret",
    GOOGLE_OAUTH_BASE_URL: undefined,
  },
}));

import {
  fetchGoogleOpenIdProfile,
  getGoogleApiRootUrl,
  getGoogleGmailApiRootUrl,
  getGoogleGmailBatchUrl,
  getGooglePeopleApiRootUrl,
  getGoogleTokenInfoUrl,
} from "./oauth";

describe("fetchGoogleOpenIdProfile", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns a validated OpenID profile", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        sub: "google-user-1",
        email: "user@example.com",
        name: "Example User",
      }),
    } as unknown as Response);

    await expect(fetchGoogleOpenIdProfile("token")).resolves.toEqual({
      sub: "google-user-1",
      email: "user@example.com",
      name: "Example User",
    });
  });

  it("accepts explicit null picture (emulators / no profile photo)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        sub: "google-user-1",
        email: "user@example.com",
        picture: null,
      }),
    } as unknown as Response);

    await expect(fetchGoogleOpenIdProfile("token")).resolves.toEqual({
      sub: "google-user-1",
      email: "user@example.com",
      picture: null,
    });
  });

  it("throws when the profile payload is missing required fields", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        sub: "google-user-1",
      }),
    } as unknown as Response);

    await expect(fetchGoogleOpenIdProfile("token")).rejects.toThrow(
      "Invalid Google profile response",
    );
  });

  it("throws when required identity fields are empty strings", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        sub: "",
        email: "",
      }),
    } as unknown as Response);

    await expect(fetchGoogleOpenIdProfile("token")).rejects.toThrow(
      "Invalid Google profile response",
    );
  });
});

describe("Google API base URL helpers", () => {
  it("uses Google production endpoints by default", () => {
    expect(getGoogleApiRootUrl()).toBe("https://www.googleapis.com/");
    expect(getGoogleGmailApiRootUrl()).toBe("https://gmail.googleapis.com/");
    expect(getGoogleGmailBatchUrl()).toBe(
      "https://gmail.googleapis.com/batch/gmail/v1",
    );
    expect(getGooglePeopleApiRootUrl()).toBe("https://people.googleapis.com/");
    expect(getGoogleTokenInfoUrl("token")).toBe(
      "https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=token",
    );
  });

  it("does not route resource APIs through GOOGLE_OAUTH_BASE_URL alone", async () => {
    vi.resetModules();
    vi.doMock("@/env", () => ({
      env: {
        GOOGLE_BASE_URL: undefined,
        GOOGLE_CLIENT_ID: "client-id",
        GOOGLE_CLIENT_SECRET: "client-secret",
        GOOGLE_OAUTH_BASE_URL: "http://localhost:4002",
      },
    }));

    const oauth = await import("./oauth");

    expect(oauth.getGoogleApiRootUrl()).toBe("https://www.googleapis.com/");
    expect(oauth.getGoogleGmailApiRootUrl()).toBe(
      "https://gmail.googleapis.com/",
    );
    expect(oauth.getGoogleGmailBatchUrl()).toBe(
      "https://gmail.googleapis.com/batch/gmail/v1",
    );
    expect(oauth.getGooglePeopleApiRootUrl()).toBe(
      "https://people.googleapis.com/",
    );
    expect(oauth.getGoogleTokenInfoUrl("token")).toBe(
      "https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=token",
    );
  });
});
