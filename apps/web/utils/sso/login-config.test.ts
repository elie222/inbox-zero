import { env } from "@/env";
import { afterEach, describe, expect, it } from "vitest";
import { hasSsoLoginButtonEnabled } from "./login-config";

describe("hasSsoLoginButtonEnabled", () => {
  const originalValue = env.NEXT_PUBLIC_SSO_LOGIN_BUTTON_ENABLED;

  afterEach(() => {
    env.NEXT_PUBLIC_SSO_LOGIN_BUTTON_ENABLED = originalValue;
  });

  it("returns false when the login button is disabled", () => {
    env.NEXT_PUBLIC_SSO_LOGIN_BUTTON_ENABLED = false;

    expect(hasSsoLoginButtonEnabled()).toBe(false);
  });

  it("returns true when the login button is enabled", () => {
    env.NEXT_PUBLIC_SSO_LOGIN_BUTTON_ENABLED = true;

    expect(hasSsoLoginButtonEnabled()).toBe(true);
  });
});
