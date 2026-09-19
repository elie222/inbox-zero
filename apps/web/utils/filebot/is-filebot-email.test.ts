import { describe, it, expect } from "vitest";
import {
  isFilebotEmail,
  getFilebotEmail,
  isFilebotNotificationMessage,
  isFilebotConversationMessage,
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

describe("isFilebotConversationMessage", () => {
  const userEmail = "john@example.com";

  it.each([
    {
      name: "notification with the filebot reply-to",
      headers: {
        from: "Inbox Zero Assistant <john@example.com>",
        to: "john@example.com",
        subject: "✓ Filed Receipt.pdf",
        "reply-to": "Inbox Zero Assistant <john+ai@example.com>",
      },
      expected: true,
    },
    {
      name: "filed notification without reply-to or display name",
      headers: {
        from: "John <john@example.com>",
        to: "John <John@Example.com>",
        subject: "✓ Filed Receipt.pdf",
      },
      expected: true,
    },
    {
      name: "ask notification without reply-to or display name",
      headers: {
        from: "john@example.com",
        to: "john@example.com",
        subject: "📄 Where should I file Contract.pdf?",
      },
      expected: true,
    },
    {
      name: "batch update notification",
      headers: {
        from: "john@example.com",
        to: "john@example.com",
        subject: "📄 Filing update for 3 documents",
      },
      expected: true,
    },
    {
      name: "correction confirmation",
      headers: {
        from: "john@example.com",
        to: "john@example.com",
        subject: "Re: ✓ Filed Receipt.pdf",
      },
      expected: true,
    },
    {
      name: "user reply to the filebot address",
      headers: {
        from: "John <john@example.com>",
        to: "Inbox Zero Assistant <john+ai@example.com>",
        subject: "Re: Your receipt",
      },
      expected: true,
    },
    {
      name: "ordinary reply to someone else",
      headers: {
        from: "John <john@example.com>",
        to: "alice@example.com",
        subject: "Re: Your receipt",
      },
      expected: false,
    },
    {
      name: "filing subject sent to someone else",
      headers: {
        from: "John <john@example.com>",
        to: "alice@example.com",
        subject: "✓ Filed Receipt.pdf",
      },
      expected: false,
    },
    {
      name: "filing subject from someone else",
      headers: {
        from: "alice@example.com",
        to: "john@example.com",
        subject: "✓ Filed Receipt.pdf",
      },
      expected: false,
    },
    {
      name: "ordinary note to self",
      headers: {
        from: "john@example.com",
        to: "john@example.com",
        subject: "Filed taxes, remember to pay",
      },
      expected: false,
    },
    {
      name: "inbound email",
      headers: {
        from: "alice@example.com",
        to: "john@example.com",
        subject: "Your receipt",
      },
      expected: false,
    },
  ])("should return $expected for $name", ({ headers, expected }) => {
    expect(
      isFilebotConversationMessage({ userEmail, message: { headers } }),
    ).toBe(expected);
  });
});
