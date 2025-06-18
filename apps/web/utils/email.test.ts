import { describe, it, expect } from "vitest";
import {
  extractNameFromEmail,
  extractEmailAddress,
  extractDomainFromEmail,
  participant,
  normalizeEmailAddress,
} from "./email";

describe("email utils", () => {
  describe("extractNameFromEmail", () => {
    it("extracts name from email with format 'Name <email>'", () => {
      expect(extractNameFromEmail("John Doe <john.doe@gmail.com>")).toBe(
        "John Doe",
      );
    });

    it("extracts email from format '<email>'", () => {
      expect(extractNameFromEmail("<john.doe@gmail.com>")).toBe(
        "john.doe@gmail.com",
      );
    });

    it("returns plain email as is", () => {
      expect(extractNameFromEmail("john.doe@gmail.com")).toBe(
        "john.doe@gmail.com",
      );
    });

    it("handles empty input", () => {
      expect(extractNameFromEmail("")).toBe("");
    });
  });

  describe("extractEmailAddress", () => {
    it("extracts email from format 'Name <email>'", () => {
      expect(extractEmailAddress("John Doe <john.doe@gmail.com>")).toBe(
        "john.doe@gmail.com",
      );
    });

    it("handles simple email format", () => {
      expect(extractEmailAddress("hello@example.com")).toBe(
        "hello@example.com",
      );
    });

    it("returns empty string for invalid format", () => {
      expect(extractEmailAddress("john.doe@gmail.com")).toBe(
        "john.doe@gmail.com",
      );
    });

    it("handles nested angle brackets", () => {
      expect(
        extractEmailAddress("Hacker <fake@email.com> <real@email.com>"),
      ).toBe("real@email.com");
    });

    it("handles malformed angle brackets", () => {
      expect(extractEmailAddress("Bad <<not@an@email>>")).toBe("");
    });

    it("extracts valid email when mixed with invalid ones", () => {
      expect(
        extractEmailAddress("Test <not@valid@email> <valid@email.com>"),
      ).toBe("valid@email.com");
    });

    it("handles empty angle brackets", () => {
      expect(extractEmailAddress("Test <>")).toBe("");
    });

    it("handles multiple @ symbols", () => {
      expect(extractEmailAddress("Test <user@@domain.com>")).toBe("");
    });

    it("validates email format", () => {
      expect(extractEmailAddress("Test <notanemail>")).toBe("");
    });

    it("extracts raw email when no valid bracketed email exists", () => {
      expect(extractEmailAddress("Test <invalid> valid@email.com")).toBe(
        "valid@email.com",
      );
    });

    // Test cases for hyphenated email addresses (the bug we're fixing)
    it("handles email addresses with hyphens in local part", () => {
      expect(extractEmailAddress("no-reply@example.com")).toBe(
        "no-reply@example.com",
      );
    });

    it("handles email addresses with hyphens in bracketed format", () => {
      expect(extractEmailAddress("System <no-reply@example.com>")).toBe(
        "no-reply@example.com",
      );
    });

    it("handles multiple hyphens in local part", () => {
      expect(extractEmailAddress("do-not-reply@example.com")).toBe(
        "do-not-reply@example.com",
      );
    });

    it("handles mixed hyphens and dots in local part", () => {
      expect(extractEmailAddress("test-user.name@example.com")).toBe(
        "test-user.name@example.com",
      );
    });

    it("handles emails with hyphens at start and end of local part", () => {
      expect(extractEmailAddress("-test@example.com")).toBe(
        "-test@example.com",
      );
      expect(extractEmailAddress("test-@example.com")).toBe(
        "test-@example.com",
      );
    });

    // Test cases for other potentially problematic characters
    it("handles email addresses with underscores", () => {
      expect(extractEmailAddress("user_name@example.com")).toBe(
        "user_name@example.com",
      );
      expect(extractEmailAddress("System <no_reply@example.com>")).toBe(
        "no_reply@example.com",
      );
    });

    it("handles email addresses with numbers", () => {
      expect(extractEmailAddress("user123@example.com")).toBe(
        "user123@example.com",
      );
      expect(extractEmailAddress("test2024@example.com")).toBe(
        "test2024@example.com",
      );
    });

    it("handles complex real-world email patterns", () => {
      // Real patterns that might break
      expect(extractEmailAddress("no-reply+tracking@example.com")).toBe(
        "no-reply+tracking@example.com",
      );
      expect(extractEmailAddress("user.name+tag@example.com")).toBe(
        "user.name+tag@example.com",
      );
      expect(extractEmailAddress("test_user-name+tag@example.com")).toBe(
        "test_user-name+tag@example.com",
      );
    });

    // Edge cases that might expose regex limitations
    it("handles edge cases that could break regex", () => {
      // Test what happens with characters we might not support
      expect(extractEmailAddress("user@sub-domain.example.com")).toBe(
        "user@sub-domain.example.com",
      );
      expect(extractEmailAddress("user@sub.domain-name.com")).toBe(
        "user@sub.domain-name.com",
      );
    });
  });

  describe("extractDomainFromEmail", () => {
    it("extracts domain from plain email", () => {
      expect(extractDomainFromEmail("john@example.com")).toBe("example.com");
    });

    it("extracts domain from email with format 'Name <email>'", () => {
      expect(extractDomainFromEmail("John Doe <john@example.com>")).toBe(
        "example.com",
      );
    });

    it("handles subdomains", () => {
      expect(extractDomainFromEmail("john@sub.example.com")).toBe(
        "sub.example.com",
      );
    });

    it("returns empty string for invalid email", () => {
      expect(extractDomainFromEmail("invalid-email")).toBe("");
    });

    it("handles empty input", () => {
      expect(extractDomainFromEmail("")).toBe("");
    });

    it("handles multiple @ symbols", () => {
      expect(extractDomainFromEmail("test@foo@example.com")).toBe("");
    });

    it("handles longer TLDs", () => {
      expect(extractDomainFromEmail("test@example.company")).toBe(
        "example.company",
      );
    });

    it("handles international domains", () => {
      expect(extractDomainFromEmail("user@münchen.de")).toBe("münchen.de");
    });

    it("handles plus addressing", () => {
      expect(extractDomainFromEmail("user+tag@example.com")).toBe(
        "example.com",
      );
    });

    it("handles quoted email addresses", () => {
      expect(extractDomainFromEmail('"John Doe" <john@example.com>')).toBe(
        "example.com",
      );
    });

    it("handles domains with multiple dots", () => {
      expect(extractDomainFromEmail("test@a.b.c.example.com")).toBe(
        "a.b.c.example.com",
      );
    });

    it("handles whitespace in formatted email", () => {
      expect(extractDomainFromEmail("John Doe    <john@example.com>")).toBe(
        "example.com",
      );
    });
  });

  describe("participant", () => {
    const message = {
      headers: {
        from: "sender@example.com",
        to: "recipient@example.com",
      },
    } as const;

    it("returns recipient when user is sender", () => {
      expect(participant(message, "sender@example.com")).toBe(
        "recipient@example.com",
      );
    });

    it("returns sender when user is recipient", () => {
      expect(participant(message, "recipient@example.com")).toBe(
        "sender@example.com",
      );
    });

    it("returns from address when no user email provided", () => {
      expect(participant(message, "")).toBe("sender@example.com");
    });
  });

  describe("normalizeEmailAddress", () => {
    it("converts email to lowercase", () => {
      expect(normalizeEmailAddress("John.Doe@GMAIL.com")).toBe(
        "johndoe@gmail.com",
      );
    });

    it("replaces whitespace with dots in local part", () => {
      expect(normalizeEmailAddress("john doe@example.com")).toBe(
        "johndoe@example.com",
      );
    });

    it("handles multiple consecutive spaces", () => {
      expect(normalizeEmailAddress("john    doe@example.com")).toBe(
        "johndoe@example.com",
      );
    });

    it("preserves existing dots", () => {
      expect(normalizeEmailAddress("john.doe@example.com")).toBe(
        "johndoe@example.com",
      );
    });

    it("trims whitespace from local part", () => {
      expect(normalizeEmailAddress(" john doe @example.com")).toBe(
        "johndoe@example.com",
      );
    });

    it("preserves domain part exactly", () => {
      expect(normalizeEmailAddress("john@sub.example.com")).toBe(
        "john@sub.example.com",
      );
    });

    it("handles invalid email format gracefully", () => {
      expect(normalizeEmailAddress("not-an-email")).toBe("not-an-email");
    });

    it("handles empty string", () => {
      expect(normalizeEmailAddress("")).toBe("");
    });
  });
});
