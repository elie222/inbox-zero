import { describe, it, expect } from "vitest";
import {
  isFilebotEmail,
  getFilebotEmail,
  isFilebotNotificationMessage,
} from "./is-filebot-email";

describe("isFilebotEmail", () => {
  it.each([
    {
      name: "valid filebot email",
      userEmail: "john@example.com",
      emailToCheck: "john+ai@example.com",
      expected: true,
    },
    {
      name: "different recipient",
      userEmail: "john@example.com",
      emailToCheck: "jane+ai@example.com",
      expected: false,
    },
    {
      name: "plain email without filebot suffix",
      userEmail: "john@example.com",
      emailToCheck: "john@example.com",
      expected: false,
    },
    {
      name: "email with old token suffix format",
      userEmail: "john@example.com",
      emailToCheck: "john+ai-abc123@example.com",
      expected: false,
    },
    {
      name: "email addresses with dots",
      userEmail: "john.doe@sub.example.com",
      emailToCheck: "john.doe+ai@sub.example.com",
      expected: true,
    },
    {
      name: "display name with angle brackets",
      userEmail: "john@example.com",
      emailToCheck: "John Doe <john+ai@example.com>",
      expected: true,
    },
    {
      name: "domain injection attempt",
      userEmail: "john@example.com",
      emailToCheck: "john+ai@evil.com+ai@example.com",
      expected: false,
    },
    {
      name: "case manipulation",
      userEmail: "john@example.com",
      emailToCheck: "john+AI@example.com",
      expected: false,
    },
    {
      name: "invalid userEmail format",
      userEmail: "notanemail",
      emailToCheck: "john+ai@example.com",
      expected: false,
    },
    {
      name: "domain case insensitivity",
      userEmail: "john@example.com",
      emailToCheck: "john+ai@EXAMPLE.COM",
      expected: true,
    },
    {
      name: "filebot email not first in multiple recipients",
      userEmail: "john@example.com",
      emailToCheck: "alice@example.com, john+ai@example.com",
      expected: true,
    },
    {
      name: "filebot email in middle of multiple recipients",
      userEmail: "john@example.com",
      emailToCheck: "alice@example.com, john+ai@example.com, bob@example.com",
      expected: true,
    },
    {
      name: "filebot email with display names in multiple recipients",
      userEmail: "john@example.com",
      emailToCheck: "Alice <alice@example.com>, John Doe <john+ai@example.com>",
      expected: true,
    },
  ])("should return $expected for $name", ({
    userEmail,
    emailToCheck,
    expected,
  }) => {
    expect(isFilebotEmail({ userEmail, emailToCheck })).toBe(expected);
  });
});

describe("getFilebotEmail", () => {
  it.each([
    {
      name: "standard email",
      userEmail: "john@example.com",
      expected: "john+ai@example.com",
    },
    {
      name: "email with dots",
      userEmail: "john.doe@sub.example.com",
      expected: "john.doe+ai@sub.example.com",
    },
  ])("should generate filebot address for $name", ({ userEmail, expected }) => {
    expect(getFilebotEmail({ userEmail })).toBe(expected);
  });

  it("should throw for invalid userEmail format", () => {
    expect(() =>
      getFilebotEmail({
        userEmail: "notanemail",
      }),
    ).toThrow("Invalid email format");
  });
});

describe("isFilebotNotificationMessage", () => {
  it.each([
    {
      name: "reply-to uses the filebot address",
      message: {
        userEmail: "john@example.com",
        from: "John <john@example.com>",
        to: "john@example.com",
        replyTo: "Inbox Zero Assistant <john+ai@example.com>",
      },
      expected: true,
    },
    {
      name: "assistant-formatted self-email without reply-to",
      message: {
        userEmail: "john@example.com",
        from: "Inbox Zero Assistant <john@example.com>",
        to: "john@example.com",
      },
      expected: true,
    },
    {
      name: "normal outbound email",
      message: {
        userEmail: "john@example.com",
        from: "John <john@example.com>",
        to: "alice@example.com",
        replyTo: "john@example.com",
      },
      expected: false,
    },
  ])("should return $expected for $name", ({ message, expected }) => {
    expect(isFilebotNotificationMessage(message)).toBe(expected);
  });
});
