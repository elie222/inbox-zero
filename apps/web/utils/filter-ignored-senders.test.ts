import { describe, it, expect } from "vitest";
import { isIgnoredSender } from "./filter-ignored-senders";

describe("isIgnoredSender", () => {
  describe("Superhuman reminder emails", () => {
    it("returns true for exact Superhuman reminder sender", () => {
      expect(isIgnoredSender("Reminder <reminder@superhuman.com>")).toBe(true);
    });

    it("returns false for different Superhuman addresses", () => {
      expect(isIgnoredSender("Support <support@superhuman.com>")).toBe(false);
    });

    it("returns false for similar but different reminder address", () => {
      expect(isIgnoredSender("Reminder <reminder@superhuman.io>")).toBe(false);
    });
  });

  describe("case sensitivity", () => {
    it("returns false for different case", () => {
      expect(isIgnoredSender("reminder <reminder@superhuman.com>")).toBe(false);
    });

    it("returns false for uppercase", () => {
      expect(isIgnoredSender("REMINDER <REMINDER@SUPERHUMAN.COM>")).toBe(false);
    });
  });

  describe("other senders", () => {
    it("returns false for regular email addresses", () => {
      expect(isIgnoredSender("john@example.com")).toBe(false);
    });

    it("returns false for email with display name", () => {
      expect(isIgnoredSender("John Doe <john@example.com>")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isIgnoredSender("")).toBe(false);
    });

    it("returns false for partial match", () => {
      expect(isIgnoredSender("reminder@superhuman.com")).toBe(false);
    });

    it("returns false for substring match", () => {
      expect(isIgnoredSender("Reminder <reminder@superhuman.com> extra")).toBe(
        false,
      );
    });
  });
});
