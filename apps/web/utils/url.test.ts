import { describe, it, expect } from "vitest";
import { getEmailUrlForMessage } from "./url";

describe("URL Generation", () => {
  const testMessageId = "18c1234567890abcdef";
  const testThreadId =
    "AQQkADAwATZiZmYAZC02NgAyNC1mOGZmAC0wMAItMDAKABAAdO%2BkeNAzxk%2BrwljH9yJ17w%3D%3D";
  const testEmail = "test@example.com";

  it("should generate Gmail URL for Google provider", () => {
    const url = getEmailUrlForMessage(
      {
        id: testMessageId,
        threadId: testThreadId,
        headers: {},
        snippet: "",
      } as any,
      "google",
      testEmail,
    );

    expect(url).toBe(
      `https://mail.google.com/mail/?authuser=${encodeURIComponent(testEmail)}#all/${testMessageId}`,
    );
  });

  it("should use message.weblink for Microsoft provider when available", () => {
    const url = getEmailUrlForMessage(
      {
        id: testMessageId,
        threadId: testThreadId,
        headers: {},
        snippet: "",
        weblink: "https://graph/link",
      } as any,
      "microsoft",
      testEmail,
    );

    expect(url).toBe("https://graph/link");
  });

  it("should return constructed URL for Microsoft when no weblink is present", () => {
    const url = getEmailUrlForMessage(
      {
        id: testMessageId,
        threadId: testThreadId,
        headers: {},
        snippet: "",
      } as any,
      "microsoft",
      testEmail,
    );

    expect(url).toContain("outlook.live.com");
    expect(url).toContain(testThreadId);
  });

  it("should fallback to Gmail URL for unknown provider", () => {
    const url = getEmailUrlForMessage(
      {
        id: testMessageId,
        threadId: testThreadId,
        headers: {},
        snippet: "",
      } as any,
      "unknown",
      testEmail,
    );

    expect(url).toBe(
      `https://mail.google.com/mail/?authuser=${encodeURIComponent(testEmail)}#all/${testMessageId}`,
    );
  });

  it("should generate different URLs for different providers", () => {
    const gmailUrl = getEmailUrlForMessage(
      {
        id: testMessageId,
        threadId: testThreadId,
        headers: {},
        snippet: "",
      } as any,
      "google",
      testEmail,
    );
    const outlookUrl = getEmailUrlForMessage(
      {
        id: testMessageId,
        threadId: testThreadId,
        headers: {},
        snippet: "",
      } as any,
      "microsoft",
      testEmail,
    );

    expect(gmailUrl).not.toBe(outlookUrl);
    expect(gmailUrl).toContain("mail.google.com");
    expect(outlookUrl).toContain("outlook.live.com");
  });

  it("should handle empty email address", () => {
    const url = getEmailUrlForMessage(
      {
        id: testMessageId,
        threadId: testThreadId,
        headers: {},
        snippet: "",
      } as any,
      "google",
      "",
    );

    expect(url).toContain("mail.google.com");
    expect(url).toContain(testMessageId);
  });

  it("should encode special characters in email address", () => {
    const url = getEmailUrlForMessage(
      {
        id: testMessageId,
        threadId: testThreadId,
        headers: {},
        snippet: "",
      } as any,
      "google",
      "test+tag@example.com",
    );

    expect(url).toContain("test%2Btag%40example.com");
  });

  it("should return constructed URL for Outlook when no weblink is provided", () => {
    const url = getEmailUrlForMessage(
      {
        id: testMessageId,
        threadId: testThreadId,
        headers: {},
        snippet: "",
      } as any,
      "microsoft",
      testEmail,
    );

    expect(url).toContain("outlook.live.com");
    expect(url).toContain(testThreadId);
  });
});
