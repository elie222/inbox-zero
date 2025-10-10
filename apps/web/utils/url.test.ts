import { describe, it, expect } from "vitest";
import { getEmailUrlForMessage } from "./url";

describe("URL Generation", () => {
  const testMessageId = "18c1234567890abcdef";
  const testThreadId =
    "AQQkADAwATZiZmYAZC02NgAyNC1mOGZmAC0wMAItMDAKABAAdO%2BkeNAzxk%2BrwljH9yJ17w%3D%3D";
  const testEmail = "test@example.com";

  it("should generate Gmail URL for Google provider", () => {
    const url = getEmailUrlForMessage(
      testMessageId,
      testThreadId,
      "google",
      testEmail,
    );

    expect(url).toBe(
      `https://mail.google.com/mail/?authuser=${encodeURIComponent(testEmail)}#all/${testMessageId}`,
    );
  });

  it("should generate Outlook URL for Microsoft provider", () => {
    const url = getEmailUrlForMessage(
      testMessageId,
      testThreadId,
      "microsoft",
      testEmail,
    );

    expect(url).toBe(
      `https://outlook.live.com/mail/0/inbox/id/${testThreadId}`,
    );
  });

  it("should generate Outlook URL defaulting to inbox folder", () => {
    const url = getEmailUrlForMessage(
      testMessageId,
      testThreadId,
      "microsoft",
      testEmail,
    );

    expect(url).toBe(
      `https://outlook.live.com/mail/0/inbox/id/${testThreadId}`,
    );
  });

  // No folder argument supported for Outlook anymore; always defaults to inbox

  it("should fallback to Gmail URL for unknown provider", () => {
    const url = getEmailUrlForMessage(
      testMessageId,
      testThreadId,
      "unknown",
      testEmail,
    );

    expect(url).toBe(
      `https://mail.google.com/mail/?authuser=${encodeURIComponent(testEmail)}#all/${testMessageId}`,
    );
  });

  it("should generate different URLs for different providers", () => {
    const gmailUrl = getEmailUrlForMessage(
      testMessageId,
      testThreadId,
      "google",
      testEmail,
    );
    const outlookUrl = getEmailUrlForMessage(
      testMessageId,
      testThreadId,
      "microsoft",
      testEmail,
    );

    expect(gmailUrl).not.toBe(outlookUrl);
    expect(gmailUrl).toContain("mail.google.com");
    expect(outlookUrl).toContain("outlook.live.com");
  });

  it("should handle empty email address", () => {
    const url = getEmailUrlForMessage(
      testMessageId,
      testThreadId,
      "google",
      "",
    );

    expect(url).toContain("mail.google.com");
    expect(url).toContain(testMessageId);
  });

  it("should encode special characters in email address", () => {
    const url = getEmailUrlForMessage(
      testMessageId,
      testThreadId,
      "google",
      "test+tag@example.com",
    );

    expect(url).toContain("test%2Btag%40example.com");
  });

  it("should default to inbox for Outlook when no folder is provided", () => {
    const url = getEmailUrlForMessage(
      testMessageId,
      testThreadId,
      "microsoft",
      testEmail,
    );

    expect(url).toContain("/inbox/id/");
  });
});
