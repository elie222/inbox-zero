import { describe, it, expect } from "vitest";
import {
  extractNameFromEmail,
  extractEmailAddress,
  extractEmailAddresses,
  extractUniqueEmailAddresses,
  splitRecipientList,
  extractDomainFromEmail,
  participant,
  normalizeEmailAddress,
  formatEmailWithName,
  getNewsletterSenderDisplayName,
  messageRepliesToSourceSender,
} from "./email";

describe("email utils", () => {
  describe("extractNameFromEmail", () => {
    it.each([
      ["formatted sender", "John Doe <john.doe@gmail.com>", "John Doe"],
      [
        "angle-bracketed address without a name",
        "<john.doe@gmail.com>",
        "john.doe@gmail.com",
      ],
      ["plain email", "john.doe@gmail.com", "john.doe@gmail.com"],
      ["empty input", "", ""],
    ])("handles %s", (_caseName, input, expected) => {
      expect(extractNameFromEmail(input)).toBe(expected);
    });
  });

  describe("extractEmailAddresses", () => {
    const cases: Array<[string, string, string[]]> = [
      ["empty string", "", []],
      ["single email address", "john@example.com", ["john@example.com"]],
      [
        "multiple comma-separated email addresses",
        "john@example.com, jane@example.com",
        ["john@example.com", "jane@example.com"],
      ],
      ["formatted sender", "John Doe <john@example.com>", ["john@example.com"]],
      [
        "multiple formatted senders",
        "John Doe <john@example.com>, Jane Smith <jane@example.com>",
        ["john@example.com", "jane@example.com"],
      ],
      [
        "mixed formatted and plain senders",
        "John Doe <john@example.com>, jane@example.com",
        ["john@example.com", "jane@example.com"],
      ],
      [
        "commas inside quoted display names",
        '"Doe, John" <john@example.com>, jane@example.com',
        ["john@example.com", "jane@example.com"],
      ],
      [
        "whitespace around addresses",
        "  john@example.com  ,  jane@example.com  ",
        ["john@example.com", "jane@example.com"],
      ],
      [
        "invalid addresses mixed with valid ones",
        "invalid-email, valid@example.com",
        ["valid@example.com"],
      ],
      [
        "multiple commas and extra spaces",
        "john@example.com , jane@example.com , bob@example.com",
        ["john@example.com", "jane@example.com", "bob@example.com"],
      ],
      [
        "empty parts between commas",
        "john@example.com,,jane@example.com",
        ["john@example.com", "jane@example.com"],
      ],
      ["trailing comma", "john@example.com,", ["john@example.com"]],
      ["leading comma", ",john@example.com", ["john@example.com"]],
      [
        "complex real-world header",
        '"Smith, John" <john.smith@example.com>, "Doe, Jane" <jane.doe@example.com>, admin@example.com',
        ["john.smith@example.com", "jane.doe@example.com", "admin@example.com"],
      ],
      [
        "plus addressing",
        "user+tag@example.com, user+other@example.com",
        ["user+tag@example.com", "user+other@example.com"],
      ],
      [
        "hyphenated addresses",
        "no-reply@example.com, support-team@example.com",
        ["no-reply@example.com", "support-team@example.com"],
      ],
      [
        "single address with angle brackets",
        "<john@example.com>",
        ["john@example.com"],
      ],
      ["all invalid addresses", "invalid, also-invalid", []],
    ];

    it.each(
      cases,
    )("extracts addresses from %s", (_caseName, input, expected) => {
      expect(extractEmailAddresses(input)).toEqual(expected);
    });
  });

  describe("extractUniqueEmailAddresses", () => {
    it("deduplicates extracted addresses while preserving first-match casing", () => {
      expect(
        extractUniqueEmailAddresses([
          "First <Sender@example.com>",
          "sender@example.com",
          "invalid-value",
          "Second <other@example.com>",
        ]),
      ).toEqual([
        "Sender@example.com",
        "sender@example.com",
        "other@example.com",
      ]);
    });

    it("can lowercase the deduplicated addresses", () => {
      expect(
        extractUniqueEmailAddresses(
          ["First <Sender@example.com>", "sender@example.com"],
          { lowercase: true },
        ),
      ).toEqual(["sender@example.com"]);
    });
  });

  describe("splitRecipientList", () => {
    it.each([
      [
        "comma-separated recipients with whitespace",
        "  john@example.com  ,  jane@example.com  ",
        ["john@example.com", "jane@example.com"],
      ],
      [
        "comma inside quoted display name",
        '"Doe, John" <john@example.com>, jane@example.com',
        ['"Doe, John" <john@example.com>', "jane@example.com"],
      ],
    ])("splits %s", (_caseName, input, expected) => {
      expect(splitRecipientList(input)).toEqual(expected);
    });
  });

  describe("extractEmailAddress", () => {
    const cases: Array<[string, string, string]> = [
      [
        "formatted sender",
        "John Doe <john.doe@gmail.com>",
        "john.doe@gmail.com",
      ],
      ["simple email", "hello@example.com", "hello@example.com"],
      ["plain Gmail address", "john.doe@gmail.com", "john.doe@gmail.com"],
      [
        "nested angle brackets",
        "Hacker <fake@email.com> <real@email.com>",
        "real@email.com",
      ],
      ["malformed angle brackets", "Bad <<not@an@email>>", ""],
      [
        "valid bracketed email mixed with invalid ones",
        "Test <not@valid@email> <valid@email.com>",
        "valid@email.com",
      ],
      ["empty angle brackets", "Test <>", ""],
      ["multiple @ symbols", "Test <user@@domain.com>", ""],
      ["non-email bracket content", "Test <notanemail>", ""],
      [
        "raw email after invalid bracket content",
        "Test <invalid> valid@email.com",
        "valid@email.com",
      ],
      ["hyphen in local part", "no-reply@example.com", "no-reply@example.com"],
      [
        "hyphen in bracketed local part",
        "System <no-reply@example.com>",
        "no-reply@example.com",
      ],
      [
        "multiple hyphens in local part",
        "do-not-reply@example.com",
        "do-not-reply@example.com",
      ],
      [
        "mixed hyphens and dots in local part",
        "test-user.name@example.com",
        "test-user.name@example.com",
      ],
      [
        "hyphen at start of local part",
        "-test@example.com",
        "-test@example.com",
      ],
      ["hyphen at end of local part", "test-@example.com", "test-@example.com"],
      [
        "underscore in local part",
        "user_name@example.com",
        "user_name@example.com",
      ],
      [
        "underscore in bracketed local part",
        "System <no_reply@example.com>",
        "no_reply@example.com",
      ],
      ["numbers in local part", "user123@example.com", "user123@example.com"],
      ["year in local part", "test2024@example.com", "test2024@example.com"],
      [
        "plus addressing with tracking tag",
        "no-reply+tracking@example.com",
        "no-reply+tracking@example.com",
      ],
      [
        "dots and plus addressing",
        "user.name+tag@example.com",
        "user.name+tag@example.com",
      ],
      [
        "underscore, hyphen, and plus addressing",
        "test_user-name+tag@example.com",
        "test_user-name+tag@example.com",
      ],
      [
        "hyphenated subdomain",
        "user@sub-domain.example.com",
        "user@sub-domain.example.com",
      ],
      [
        "hyphenated nested domain",
        "user@sub.domain-name.com",
        "user@sub.domain-name.com",
      ],
    ];

    it.each(cases)("handles %s", (_caseName, input, expected) => {
      expect(extractEmailAddress(input)).toBe(expected);
    });
  });

  describe("messageRepliesToSourceSender", () => {
    const cases: Array<
      [string, MessageHeaders, MessageHeaders, boolean | null]
    > = [
      [
        "sent message is addressed to the source sender",
        { from: "Sales <sales@example.com>" },
        { from: "user@example.com", to: "Sales <sales@example.com>" },
        true,
      ],
      [
        "reply-to provides the expected reply target",
        {
          from: "noreply@example.com",
          "reply-to": "Ops <ops@example.com>, Support <support@example.com>",
        },
        { from: "user@example.com", to: "support@example.com" },
        true,
      ],
      [
        "reply target is in cc recipients",
        { from: "Sales <sales@example.com>" },
        {
          from: "user@example.com",
          to: "teammate@example.com",
          cc: "Sales <sales@example.com>",
        },
        true,
      ],
      [
        "sent message only goes to someone else",
        { from: "Sales <sales@example.com>" },
        { from: "user@example.com", to: "teammate@example.com" },
        false,
      ],
      [
        "expected target cannot be read",
        { from: "" },
        { to: "teammate@example.com" },
        null,
      ],
      [
        "sent recipients cannot be read",
        { from: "sales@example.com" },
        { to: "" },
        null,
      ],
    ];

    it.each(
      cases,
    )("handles %s", (_caseName, sourceHeaders, sentHeaders, expected) => {
      expect(
        messageRepliesToSourceSender({
          sourceMessage: createMessage(sourceHeaders),
          sentMessage: createMessage(sentHeaders),
        }),
      ).toBe(expected);
    });
  });

  describe("extractDomainFromEmail", () => {
    it.each([
      ["plain email", "john@example.com", "example.com"],
      ["formatted sender", "John Doe <john@example.com>", "example.com"],
      ["subdomain", "john@sub.example.com", "sub.example.com"],
      ["invalid email", "invalid-email", ""],
      ["empty input", "", ""],
      ["multiple @ symbols", "test@foo@example.com", ""],
      ["longer TLD", "test@example.company", "example.company"],
      ["international domain", "user@münchen.de", "münchen.de"],
      ["plus addressing", "user+tag@example.com", "example.com"],
      [
        "quoted formatted sender",
        '"John Doe" <john@example.com>',
        "example.com",
      ],
      [
        "domain with multiple dots",
        "test@a.b.c.example.com",
        "a.b.c.example.com",
      ],
      [
        "whitespace in formatted sender",
        "John Doe    <john@example.com>",
        "example.com",
      ],
    ])("extracts domain from %s", (_caseName, input, expected) => {
      expect(extractDomainFromEmail(input)).toBe(expected);
    });
  });

  describe("participant", () => {
    const message = {
      headers: {
        from: "sender@example.com",
        to: "recipient@example.com",
      },
    } as const;

    it.each([
      ["user is sender", "sender@example.com", "recipient@example.com"],
      ["user is recipient", "recipient@example.com", "sender@example.com"],
      ["no user email is provided", "", "sender@example.com"],
    ])("returns participant when %s", (_caseName, userEmail, expected) => {
      expect(participant(message, userEmail)).toBe(expected);
    });
  });

  describe("normalizeEmailAddress", () => {
    it.each([
      [
        "upper-case Gmail address with dots",
        "John.Doe@GMAIL.com",
        "johndoe@gmail.com",
      ],
      [
        "whitespace in local part",
        "john doe@example.com",
        "johndoe@example.com",
      ],
      [
        "multiple consecutive spaces",
        "john    doe@example.com",
        "johndoe@example.com",
      ],
      ["existing dots", "john.doe@example.com", "johndoe@example.com"],
      [
        "whitespace around local part",
        " john doe @example.com",
        "johndoe@example.com",
      ],
      ["subdomain", "john@sub.example.com", "john@sub.example.com"],
      ["invalid email format", "not-an-email", "not-an-email"],
      ["empty string", "", ""],
    ])("normalizes %s", (_caseName, input, expected) => {
      expect(normalizeEmailAddress(input)).toBe(expected);
    });
  });

  describe("formatEmailWithName", () => {
    const cases: Array<
      [string, string | null | undefined, string | null | undefined, string]
    > = [
      [
        "name and address",
        "John Doe",
        "john.doe@example.com",
        "John Doe <john.doe@example.com>",
      ],
      ["null name", null, "john.doe@example.com", "john.doe@example.com"],
      [
        "undefined name",
        undefined,
        "john.doe@example.com",
        "john.doe@example.com",
      ],
      ["empty name", "", "john.doe@example.com", "john.doe@example.com"],
      [
        "name that equals address",
        "john.doe@example.com",
        "john.doe@example.com",
        "john.doe@example.com",
      ],
      ["null address", "John Doe", null, ""],
      ["undefined address", "John Doe", undefined, ""],
      ["empty address", "John Doe", "", ""],
      ["null name and address", null, null, ""],
      ["undefined name and address", undefined, undefined, ""],
      [
        "special characters in name",
        "O'Brien, John",
        "john@example.com",
        "O'Brien, John <john@example.com>",
      ],
      [
        "unicode name",
        "José García",
        "jose@example.com",
        "José García <jose@example.com>",
      ],
      ["non-Latin name", "李明", "li@example.com", "李明 <li@example.com>"],
      [
        "hyphenated address",
        "System",
        "no-reply@example.com",
        "System <no-reply@example.com>",
      ],
      [
        "plus-addressed email",
        "Support",
        "support+tag@example.com",
        "Support <support+tag@example.com>",
      ],
    ];

    it.each(
      cases,
    )("formats %s", (_caseName, displayName, address, expected) => {
      expect(formatEmailWithName(displayName, address)).toBe(expected);
    });

    it("is the inverse of extractNameFromEmail and extractEmailAddress", () => {
      const formatted = formatEmailWithName("John Doe", "john@example.com");
      expect(extractNameFromEmail(formatted)).toBe("John Doe");
      expect(extractEmailAddress(formatted)).toBe("john@example.com");
    });
  });

  describe("getNewsletterSenderDisplayName", () => {
    const cases: Array<[string, NewsletterSender, string]> = [
      [
        "normal sender display name",
        {
          email: "updates@example.com",
          fromName: "Example Updates",
          minFromName: "Example Updates",
          maxFromName: "Example Updates",
        },
        "Example Updates",
      ],
      [
        "multiple display names for GitHub notifications",
        {
          email: "notifications@github.com",
          fromName: "Some Person",
          minFromName: "Another Person",
          maxFromName: "Some Person",
        },
        "github.com",
      ],
      [
        "multiple display names for LinkedIn invitations",
        {
          email: "invitations@linkedin.com",
          fromName: "Some Person",
          minFromName: "Another Person",
          maxFromName: "Some Person",
        },
        "linkedin.com",
      ],
      [
        "multiple display names for LinkedIn digests",
        {
          email: "messaging-digest-noreply@linkedin.com",
          fromName: "Some Person via LinkedIn",
          minFromName: "Another Person via LinkedIn",
          maxFromName: "Some Person via LinkedIn",
        },
        "linkedin.com",
      ],
      [
        "matching min and max names",
        {
          email: "notifications@example.com",
          fromName: "Example",
          minFromName: "Example",
          maxFromName: "Example",
        },
        "Example",
      ],
      [
        "missing display name",
        { email: "updates@example.com", fromName: null },
        "",
      ],
    ];

    it.each(cases)("handles %s", (_caseName, sender, expected) => {
      expect(getNewsletterSenderDisplayName(sender)).toBe(expected);
    });
  });
});

type MessageHeaders = Parameters<typeof createMessage>[0];
type NewsletterSender = Parameters<typeof getNewsletterSenderDisplayName>[0];

function createMessage(
  headers: Partial<{
    from: string;
    to: string;
    cc: string;
    bcc: string;
    "reply-to": string;
  }>,
) {
  return {
    headers: {
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Subject",
      date: "2026-03-17T10:00:00.000Z",
      ...headers,
    },
  };
}
