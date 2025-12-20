import { describe, it, expect } from "vitest";
import {
  isFilebotEmail,
  getFilebotEmail,
  extractFilebotToken,
} from "./is-filebot-email";

describe("isFilebotEmail", () => {
  it("should return true for valid filebot email with token", () => {
    const result = isFilebotEmail({
      userEmail: "john@example.com",
      emailToCheck: "john+filebot-abc123@example.com",
    });
    expect(result).toBe(true);
  });

  it("should return false when recipient is different user", () => {
    const result = isFilebotEmail({
      userEmail: "john@example.com",
      emailToCheck: "jane+filebot-abc123@example.com",
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

  it("should return false for filebot without token", () => {
    const result = isFilebotEmail({
      userEmail: "john@example.com",
      emailToCheck: "john+filebot@example.com",
    });
    expect(result).toBe(false);
  });

  it("should handle email addresses with dots", () => {
    const result = isFilebotEmail({
      userEmail: "john.doe@sub.example.com",
      emailToCheck: "john.doe+filebot-token123@sub.example.com",
    });
    expect(result).toBe(true);
  });

  it("should handle display name with angle brackets", () => {
    const result = isFilebotEmail({
      userEmail: "john@example.com",
      emailToCheck: "John Doe <john+filebot-xyz789@example.com>",
    });
    expect(result).toBe(true);
  });

  it("should reject malicious domain injection", () => {
    const result = isFilebotEmail({
      userEmail: "john@example.com",
      emailToCheck: "john+filebot-abc@evil.com+filebot-abc@example.com",
    });
    expect(result).toBe(false);
  });

  it("should reject case manipulation", () => {
    const result = isFilebotEmail({
      userEmail: "john@example.com",
      emailToCheck: "john+FILEBOT-abc123@example.com",
    });
    expect(result).toBe(false);
  });
});

describe("getFilebotEmail", () => {
  it("should generate correct filebot email with token", () => {
    const result = getFilebotEmail({
      userEmail: "john@example.com",
      token: "abc123",
    });
    expect(result).toBe("john+filebot-abc123@example.com");
  });

  it("should handle email with dots", () => {
    const result = getFilebotEmail({
      userEmail: "john.doe@sub.example.com",
      token: "xyz789",
    });
    expect(result).toBe("john.doe+filebot-xyz789@sub.example.com");
  });
});

describe("extractFilebotToken", () => {
  it("should extract token from valid filebot email", () => {
    const result = extractFilebotToken({
      userEmail: "john@example.com",
      emailToCheck: "john+filebot-abc123@example.com",
    });
    expect(result).toBe("abc123");
  });

  it("should return null for non-filebot email", () => {
    const result = extractFilebotToken({
      userEmail: "john@example.com",
      emailToCheck: "john@example.com",
    });
    expect(result).toBeNull();
  });

  it("should return null for different user", () => {
    const result = extractFilebotToken({
      userEmail: "john@example.com",
      emailToCheck: "jane+filebot-abc123@example.com",
    });
    expect(result).toBeNull();
  });

  it("should extract token from email with display name", () => {
    const result = extractFilebotToken({
      userEmail: "john@example.com",
      emailToCheck: "John <john+filebot-mytoken@example.com>",
    });
    expect(result).toBe("mytoken");
  });

  it("should return null for empty email", () => {
    const result = extractFilebotToken({
      userEmail: "john@example.com",
      emailToCheck: "",
    });
    expect(result).toBeNull();
  });
});
