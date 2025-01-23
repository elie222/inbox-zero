import { describe, it, expect } from "vitest";
import { isAssistantEmail } from "./is-assistant-email";

describe("isAssistantEmail", () => {
  it("should return true when recipient is user's assistant email", () => {
    const result = isAssistantEmail({
      userEmail: "john@example.com",
      emailToCheck: "john+assistant@example.com",
    });
    expect(result).toBe(true);
  });

  it("should return false when recipient is not user's assistant email", () => {
    const result = isAssistantEmail({
      userEmail: "john@example.com",
      emailToCheck: "jane+assistant@example.com",
    });
    expect(result).toBe(false);
  });

  it("should return false when recipient has different format", () => {
    const result = isAssistantEmail({
      userEmail: "john@example.com",
      emailToCheck: "john@example.com",
    });
    expect(result).toBe(false);
  });

  it("should handle email addresses with multiple dots", () => {
    const result = isAssistantEmail({
      userEmail: "john.middle.doe@sub.example.com",
      emailToCheck: "john.middle.doe+assistant@sub.example.com",
    });
    expect(result).toBe(true);
  });

  it("should handle recipient email with display name and angle brackets", () => {
    const result = isAssistantEmail({
      userEmail: "john@example.com",
      emailToCheck: "John Doe <john+assistant@example.com>",
    });
    expect(result).toBe(true);
  });

  it("should reject malicious suffix injection", () => {
    const result = isAssistantEmail({
      userEmail: "john@example.com",
      emailToCheck: "john+assistant@evil.com+assistant@example.com",
    });
    expect(result).toBe(false);
  });

  it("should reject multiple plus signs", () => {
    const result = isAssistantEmail({
      userEmail: "john@example.com",
      emailToCheck: "john+evil+assistant@example.com",
    });
    expect(result).toBe(false);
  });

  it("should reject assistant in wrong position", () => {
    const result = isAssistantEmail({
      userEmail: "john@example.com",
      emailToCheck: "john+evilassistant@example.com",
    });
    expect(result).toBe(false);
  });

  it("should reject case manipulation", () => {
    const result = isAssistantEmail({
      userEmail: "john@example.com",
      emailToCheck: "john+ASSISTANT@example.com",
    });
    expect(result).toBe(false);
  });

  it("should match valid assistant email with number", () => {
    const result = isAssistantEmail({
      userEmail: "john@example.com",
      emailToCheck: "john+assistant42@example.com",
    });
    expect(result).toBe(true);
  });
});
