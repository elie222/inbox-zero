import { describe, it, expect } from "vitest";
import { hasUnquotedParentFolderId } from "./message";

describe("hasUnquotedParentFolderId", () => {
  describe("should return true for unquoted parentFolderId", () => {
    it("detects direct parentFolderId filter", () => {
      const query = "parentFolderId eq 'inbox'";
      expect(hasUnquotedParentFolderId(query)).toBe(true);
    });

    it("detects parentFolderId in compound query", () => {
      const query =
        "from eq 'test@example.com' and parentFolderId eq 'archive'";
      expect(hasUnquotedParentFolderId(query)).toBe(true);
    });

    it("detects parentFolderId with 'ne' operator", () => {
      const query = "parentFolderId ne 'drafts'";
      expect(hasUnquotedParentFolderId(query)).toBe(true);
    });

    it("detects parentFolderId in or conditions", () => {
      const query =
        "(parentFolderId eq 'inbox' or parentFolderId eq 'archive')";
      expect(hasUnquotedParentFolderId(query)).toBe(true);
    });
  });

  describe("should return false for quoted parentFolderId", () => {
    it("ignores parentFolderId inside single quotes", () => {
      const query = "subject eq 'parentFolderId eq 123'";
      expect(hasUnquotedParentFolderId(query)).toBe(false);
    });

    it("ignores parentFolderId inside double quotes", () => {
      const query = 'subject eq "parentFolderId eq 123"';
      expect(hasUnquotedParentFolderId(query)).toBe(false);
    });

    it("ignores parentFolderId in quoted subject", () => {
      const query =
        "from eq 'user@domain.com' and subject eq 'Re: parentFolderId issues'";
      expect(hasUnquotedParentFolderId(query)).toBe(false);
    });

    it("ignores parentFolderId in quoted body search", () => {
      const query = "body contains 'This email mentions parentFolderId'";
      expect(hasUnquotedParentFolderId(query)).toBe(false);
    });

    it("handles escaped quotes correctly", () => {
      const query = "subject eq 'with \\'escaped\\' quotes and parentFolderId'";
      expect(hasUnquotedParentFolderId(query)).toBe(false);
    });

    it("handles mixed single and double quotes", () => {
      const query = `subject eq "outer 'inner parentFolderId' outer"`;
      expect(hasUnquotedParentFolderId(query)).toBe(false);
    });
  });

  describe("mixed cases", () => {
    it("detects unquoted parentFolderId even when quoted ones exist", () => {
      const query =
        "subject eq 'test parentFolderId' and parentFolderId eq 'inbox'";
      expect(hasUnquotedParentFolderId(query)).toBe(true);
    });

    it("handles complex nested quotes", () => {
      const query = `subject eq "complex 'nested parentFolderId' quotes" and from eq 'test@example.com'`;
      expect(hasUnquotedParentFolderId(query)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("returns false for empty query", () => {
      const query = "";
      expect(hasUnquotedParentFolderId(query)).toBe(false);
    });

    it("returns false for query without parentFolderId", () => {
      const query = "from eq 'test@example.com'";
      expect(hasUnquotedParentFolderId(query)).toBe(false);
    });

    it("handles partial matches correctly", () => {
      const query = "myparentFolderId eq 'test'";
      expect(hasUnquotedParentFolderId(query)).toBe(false);
    });

    it("handles word boundaries correctly", () => {
      const query = "parentFolderIdSomething eq 'test'";
      expect(hasUnquotedParentFolderId(query)).toBe(false);
    });

    it("detects parentFolderId at start of query", () => {
      const query = "parentFolderId eq 'inbox' and from eq 'test@example.com'";
      expect(hasUnquotedParentFolderId(query)).toBe(true);
    });

    it("detects parentFolderId at end of query", () => {
      const query = "from eq 'test@example.com' and parentFolderId eq 'inbox'";
      expect(hasUnquotedParentFolderId(query)).toBe(true);
    });

    it("handles unclosed quotes gracefully", () => {
      const query = "subject eq 'unclosed quote and parentFolderId";
      expect(hasUnquotedParentFolderId(query)).toBe(false);
    });
  });
});
