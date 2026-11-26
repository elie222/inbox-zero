import { describe, expect, it } from "vitest";
import { extractOtpCode, isOtpSubject } from "./otp";

describe("isOtpSubject", () => {
  it.each([
    "Your Apollo.io verification code",
    "Cloudflare Access login code",
    "Your one-time password for Animations on the web",
    "Use this security code to sign in",
    "Your 2FA code is 123456",
    "482901 is your OTP",
    "Your code to log in",
  ])("recognizes an OTP subject: %s", (subject) => {
    expect(isOtpSubject(subject)).toBe(true);
  });

  it.each([
    "Protect your organization with Mandatory Two-Step Verification",
    "Your password was changed",
    "Suspicious login attempt",
    "Security alert for your account",
    "Reset your password",
    "Your order confirmation",
  ])("does not confuse a related account alert with an OTP: %s", (subject) => {
    expect(isOtpSubject(subject)).toBe(false);
  });
});

describe("extractOtpCode", () => {
  it.each([
    ["Use code 235578 to log in", "235578"],
    ["482901 is your OTP", "482901"],
    ["Your 2FA code is 123456.", "123456"],
    ["G-482193 is your verification code", "482193"],
    ["Your code: 123-456", "123456"],
    ["Your code is 123 456", "123456"],
    ["Sign-in code 7429", "7429"],
    ["Your login code is K7Q2XM", "K7Q2XM"],
    ["Your verification code:482913", "482913"],
    ["Questions? Call (555) 123-4567. Your code is 482913", "482913"],
  ])("finds the code in %s", (text, code) => {
    expect(extractOtpCode([text])).toBe(code);
  });

  it.each([
    "Your verification code",
    "Your 2FA code",
    "Order total $1234.56",
    "Meeting at 10:30 on 2026-10-29",
    "Call +1 555 123 4567",
    "Copyright 2026 Example Inc.",
    "Save 1500% today",
  ])("finds no code in %s", (text) => {
    expect(extractOtpCode([text])).toBeNull();
  });

  it("falls back to later texts when the first has no code", () => {
    expect(
      extractOtpCode([
        "Your verification code",
        "Hi there, your code is 918273. It expires in 10 minutes.",
      ]),
    ).toBe("918273");
  });
});
