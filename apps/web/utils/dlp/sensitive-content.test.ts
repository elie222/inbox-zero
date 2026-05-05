import { describe, expect, it } from "vitest";
import {
  parseSensitiveDataPolicy,
  redactSensitiveContent,
  scanSensitiveContent,
} from "@/utils/dlp/sensitive-content";

describe("sensitive content scanning", () => {
  it("detects and redacts credential-like values", () => {
    const token = "x".repeat(24);
    const text = `api_key="${token}"`;

    expect(scanSensitiveContent(text)).toEqual([
      expect.objectContaining({
        category: "credential",
        label: "credential_value",
      }),
    ]);
    expect(redactSensitiveContent(text)).toBe(
      'api_key="[REDACTED:CREDENTIAL]"',
    );
  });

  it("detects Luhn-valid payment-card-like numbers", () => {
    const cardLikeNumber = makeLuhnNumber("123456789012345");
    const text = `card ${cardLikeNumber.slice(0, 4)} ${cardLikeNumber.slice(4, 8)} ${cardLikeNumber.slice(8, 12)} ${cardLikeNumber.slice(12)}`;

    expect(scanSensitiveContent(text)).toEqual([
      expect.objectContaining({
        category: "payment_card",
        label: "luhn_number",
      }),
    ]);
    expect(redactSensitiveContent(text)).toBe("card [REDACTED:PAYMENT_CARD]");
  });

  it("ignores long numbers that do not pass the Luhn check", () => {
    expect(scanSensitiveContent("reference 1234567890123456")).toEqual([]);
  });

  it("defaults unknown policy values to allow", () => {
    expect(parseSensitiveDataPolicy("unknown")).toBe("ALLOW");
    expect(parseSensitiveDataPolicy(null)).toBe("ALLOW");
  });
});

function makeLuhnNumber(prefix: string) {
  for (let digit = 0; digit <= 9; digit++) {
    const candidate = `${prefix}${digit}`;
    if (passesLuhnCheck(candidate)) return candidate;
  }

  throw new Error("Could not create test number");
}

function passesLuhnCheck(digits: string) {
  let sum = 0;
  let doubleDigit = false;

  for (let index = digits.length - 1; index >= 0; index--) {
    let value = Number(digits[index]);
    if (doubleDigit) {
      value *= 2;
      if (value > 9) value -= 9;
    }

    sum += value;
    doubleDigit = !doubleDigit;
  }

  return sum > 0 && sum % 10 === 0;
}
