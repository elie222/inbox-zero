import { describe, it, expect } from "vitest";
import { isAssistantEmail } from "./is-assistant-email";

describe("isAssistantEmail", () => {
  it("should return true when recipient is user's assistant email", () => {
    const result = isAssistantEmail({
      userEmail: "john@example.com",
      recipientEmail: "john+assistant@example.com",
    });
    expect(result).toBe(true);
  });

  it("should return false when recipient is not user's assistant email", () => {
    const result = isAssistantEmail({
      userEmail: "john@example.com",
      recipientEmail: "jane+assistant@example.com",
    });
    expect(result).toBe(false);
  });

  it("should return false when recipient has different format", () => {
    const result = isAssistantEmail({
      userEmail: "john@example.com",
      recipientEmail: "john@example.com",
    });
    expect(result).toBe(false);
  });

  it("should handle email addresses with multiple dots", () => {
    const result = isAssistantEmail({
      userEmail: "john.middle.doe@sub.example.com",
      recipientEmail: "john.middle.doe+assistant@sub.example.com",
    });
    expect(result).toBe(true);
  });

  it("should handle recipient email with display name and angle brackets", () => {
    const result = isAssistantEmail({
      userEmail: "john@example.com",
      recipientEmail: "John Doe <john+assistant@example.com>",
    });
    expect(result).toBe(true);
  });
});
