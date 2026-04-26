import { describe, expect, it } from "vitest";
import {
  assertAllowedAuthSignupEmail,
  isAllowedAuthSignupEmail,
} from "./auth-signup-policy";

describe("isAllowedAuthSignupEmail", () => {
  it("allows all sign-ups when no allowlist is configured", () => {
    expect(isAllowedAuthSignupEmail("user@example.com", {})).toBe(true);
  });

  it("matches explicit emails case-insensitively", () => {
    expect(
      isAllowedAuthSignupEmail("Founder@Example.com", {
        allowedEmails: [" founder@example.com "],
      }),
    ).toBe(true);
  });

  it("matches allowed domains and strips leading @", () => {
    expect(
      isAllowedAuthSignupEmail("user@company.com", {
        allowedDomains: ["@company.com"],
      }),
    ).toBe(true);
  });

  it("allows explicit personal emails alongside domain restrictions", () => {
    expect(
      isAllowedAuthSignupEmail("founder@gmail.com", {
        allowedEmails: ["founder@gmail.com"],
        allowedDomains: ["company.com"],
      }),
    ).toBe(true);
  });

  it("rejects sign-ups outside the configured allowlist", () => {
    expect(
      isAllowedAuthSignupEmail("user@outside.com", {
        allowedEmails: ["founder@gmail.com"],
        allowedDomains: ["company.com"],
      }),
    ).toBe(false);
  });
});

describe("assertAllowedAuthSignupEmail", () => {
  it("throws the login error code when sign-up is blocked", () => {
    expect(() =>
      assertAllowedAuthSignupEmail("user@outside.com", {
        allowedDomains: ["company.com"],
      }),
    ).toThrowError("signup_not_allowed");
  });
});
