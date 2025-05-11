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
