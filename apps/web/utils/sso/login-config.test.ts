import { env } from "@/env";
import { afterEach, describe, expect, it } from "vitest";
import { hasSsoLoginButtonEnabled } from "./login-config";

describe("hasSsoLoginButtonEnabled", () => {
  const originalValue = env.SSO_LOGIN_ENABLED;

  afterEach(() => {
    env.SSO_LOGIN_ENABLED = originalValue;
  });

  it("returns false when the login button is disabled", () => {
    env.SSO_LOGIN_ENABLED = false;

    expect(hasSsoLoginButtonEnabled()).toBe(false);
  });

  it("returns true when the login button is enabled", () => {
    env.SSO_LOGIN_ENABLED = true;

    expect(hasSsoLoginButtonEnabled()).toBe(true);
  });
});
