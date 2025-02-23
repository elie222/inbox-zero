import { describe, it, expect, vi } from "vitest";
import {
  stringifyEmail,
  stringifyEmailSimple,
  stringifyEmailFromBody,
} from "./stringify-email";
import type { EmailForLLM } from "@/utils/types";

vi.mock("server-only", () => ({}));

describe("stringifyEmail", () => {
  const mockEmail: EmailForLLM = {
    from: "test@example.com",
    subject: "Test Subject",
    content: "Hello world",
    replyTo: "reply@example.com",
    cc: "cc@example.com",
  };

  it("should format email with all fields", () => {
    const result = stringifyEmail(mockEmail, 1000);
    expect(result).toBe(
      "<from>test@example.com</from>\n" +
        "<replyTo>reply@example.com</replyTo>\n" +
        "<cc>cc@example.com</cc>\n" +
        "<subject>Test Subject</subject>\n" +
        "<body>Hello world</body>",
    );
  });

  it("should truncate content to maxLength", () => {
    const longContent = "a".repeat(100);
    const maxLength = 50;
    const result = stringifyEmail(
      {
        from: "test@example.com",
        subject: "Test Subject",
        content: longContent,
      },
      maxLength,
    );
    expect(result).toBe(
      `<from>test@example.com</from>\n<subject>Test Subject</subject>\n<body>${"a".repeat(50)}...</body>`,
    );
  });

  it("should omit optional fields when not provided", () => {
    const minimalEmail: EmailForLLM = {
      from: "test@example.com",
      subject: "Test Subject",
      content: "Hello world",
    };
    const result = stringifyEmail(minimalEmail, 1000);
    expect(result).toBe(
      "<from>test@example.com</from>\n" +
        "<subject>Test Subject</subject>\n" +
        "<body>Hello world</body>",
    );
  });
});

describe("stringifyEmailSimple", () => {
  it("should format email with basic fields", () => {
    const email: EmailForLLM = {
      from: "test@example.com",
      subject: "Test Subject",
      content: "Hello world",
      replyTo: "reply@example.com", // Should be ignored
      cc: "cc@example.com", // Should be ignored
    };

    const result = stringifyEmailSimple(email);
    expect(result).toBe(
      "<from>test@example.com</from>\n" +
        "<subject>Test Subject</subject>\n" +
        "<body>Hello world</body>",
    );
  });
});

describe("stringifyEmailFromBody", () => {
  it("should format email with only from and body", () => {
    const email: EmailForLLM = {
      from: "test@example.com",
      subject: "Test Subject", // Should be ignored
      content: "Hello world",
      replyTo: "reply@example.com", // Should be ignored
      cc: "cc@example.com", // Should be ignored
    };

    const result = stringifyEmailFromBody(email);
    expect(result).toBe(
      "<from>test@example.com</from>\n" + "<body>Hello world</body>",
    );
  });
});
