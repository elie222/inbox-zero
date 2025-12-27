import { describe, it, expect } from "vitest";
import { isFilebotEmail, getFilebotEmail } from "./is-filebot-email";

describe("isFilebotEmail", () => {
  it("should return true for valid filebot email", () => {
    const result = isFilebotEmail({
      userEmail: "john@example.com",
      emailToCheck: "john+filebot@example.com",
    });
    expect(result).toBe(true);
  });

  it("should return false when recipient is different user", () => {
    const result = isFilebotEmail({
      userEmail: "john@example.com",
      emailToCheck: "jane+filebot@example.com",
    });
    expect(result).toBe(false);
  });

  it("should return false for plain email without filebot suffix", () => {
    const result = isFilebotEmail({
      userEmail: "john@example.com",
      emailToCheck: "john@example.com",
    });
    expect(result).toBe(false);
  });

  it("should return false for email with token suffix (old format)", () => {
    const result = isFilebotEmail({
      userEmail: "john@example.com",
      emailToCheck: "john+filebot-abc123@example.com",
    });
    expect(result).toBe(false);
  });

  it("should handle email addresses with dots", () => {
    const result = isFilebotEmail({
      userEmail: "john.doe@sub.example.com",
      emailToCheck: "john.doe+filebot@sub.example.com",
    });
    expect(result).toBe(true);
  });

  it("should handle display name with angle brackets", () => {
    const result = isFilebotEmail({
      userEmail: "john@example.com",
      emailToCheck: "John Doe <john+filebot@example.com>",
    });
    expect(result).toBe(true);
  });

  it("should reject malicious domain injection", () => {
    const result = isFilebotEmail({
      userEmail: "john@example.com",
      emailToCheck: "john+filebot@evil.com+filebot@example.com",
    });
    expect(result).toBe(false);
  });

  it("should reject case manipulation", () => {
    const result = isFilebotEmail({
      userEmail: "john@example.com",
      emailToCheck: "john+FILEBOT@example.com",
    });
    expect(result).toBe(false);
  });

  it("should handle invalid userEmail format gracefully", () => {
    const result = isFilebotEmail({
      userEmail: "notanemail",
      emailToCheck: "john+filebot@example.com",
    });
    expect(result).toBe(false);
  });

  it("should handle domain case insensitivity", () => {
    const result = isFilebotEmail({
      userEmail: "john@example.com",
      emailToCheck: "john+filebot@EXAMPLE.COM",
    });
    expect(result).toBe(true);
  });

  it("should detect filebot email when not first in multiple recipients", () => {
    const result = isFilebotEmail({
      userEmail: "john@example.com",
      emailToCheck: "alice@example.com, john+filebot@example.com",
    });
    expect(result).toBe(true);
  });

  it("should detect filebot email in middle of multiple recipients", () => {
    const result = isFilebotEmail({
      userEmail: "john@example.com",
      emailToCheck:
        "alice@example.com, john+filebot@example.com, bob@example.com",
    });
    expect(result).toBe(true);
  });

  it("should detect filebot email with display names in multiple recipients", () => {
    const result = isFilebotEmail({
      userEmail: "john@example.com",
      emailToCheck:
        "Alice <alice@example.com>, John Doe <john+filebot@example.com>",
    });
    expect(result).toBe(true);
  });
});

describe("getFilebotEmail", () => {
  it("should generate correct filebot email", () => {
    const result = getFilebotEmail({
      userEmail: "john@example.com",
    });
    expect(result).toBe("john+filebot@example.com");
  });

  it("should handle email with dots", () => {
    const result = getFilebotEmail({
      userEmail: "john.doe@sub.example.com",
    });
    expect(result).toBe("john.doe+filebot@sub.example.com");
  });

  it("should throw for invalid userEmail format", () => {
    expect(() =>
      getFilebotEmail({
        userEmail: "notanemail",
      }),
    ).toThrow("Invalid email format");
  });
});
