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
    id: "1",
    from: "test@example.com",
    subject: "Test Subject",
    content: "Hello world",
    replyTo: "reply@example.com",
    cc: "cc@example.com",
    to: "to@example.com",
    date: new Date("2025-04-06T13:37:14.413Z"),
  };

  it("should format email with all fields", () => {
    const result = stringifyEmail(mockEmail, 1000);
    expect(result).toBe(
      "<from>test@example.com</from>\n" +
        "<replyTo>reply@example.com</replyTo>\n" +
        "<to>to@example.com</to>\n" +
        "<cc>cc@example.com</cc>\n" +
        "<date>2025-04-06T13:37:14.413Z</date>\n" +
        "<subject>Test Subject</subject>\n" +
        "<body>Hello world</body>",
    );
  });

  it("should truncate content to maxLength", () => {
    const longContent = "a".repeat(100);
    const maxLength = 50;
    const result = stringifyEmail(
      {
        id: "1",
        from: "test@example.com",
        to: "to@example.com",
        subject: "Test Subject",
        content: longContent,
      },
      maxLength,
    );
    expect(result).toBe(
      `<from>test@example.com</from>\n<to>to@example.com</to>\n<subject>Test Subject</subject>\n<body>${"a".repeat(50)}...</body>`,
    );
  });

  it("should omit optional fields when not provided", () => {
    const minimalEmail: EmailForLLM = {
      id: "1",
      from: "test@example.com",
      subject: "Test Subject",
      content: "Hello world",
      to: "to@example.com",
    };
    const result = stringifyEmail(minimalEmail, 1000);
    expect(result).toBe(
      "<from>test@example.com</from>\n" +
        "<to>to@example.com</to>\n" +
        "<subject>Test Subject</subject>\n" +
        "<body>Hello world</body>",
    );
  });
});

describe("stringifyEmailSimple", () => {
  it("should format email with basic fields", () => {
    const email: EmailForLLM = {
      id: "1",
      from: "test@example.com",
      subject: "Test Subject",
      content: "Hello world",
      replyTo: "reply@example.com", // Should be ignored
      cc: "cc@example.com", // Should be ignored
      to: "to@example.com",
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
      id: "1",
      from: "test@example.com",
      subject: "Test Subject", // Should be ignored
      content: "Hello world",
      replyTo: "reply@example.com", // Should be ignored
      cc: "cc@example.com", // Should be ignored
      to: "to@example.com",
    };

    const result = stringifyEmailFromBody(email);
    expect(result).toBe(
      "<from>test@example.com</from>\n<body>Hello world</body>",
    );
  });
});
