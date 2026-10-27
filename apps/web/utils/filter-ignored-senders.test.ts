import { describe, it, expect } from "vitest";
import { isIgnoredSender } from "./filter-ignored-senders";

describe("isIgnoredSender", () => {
  describe("Superhuman reminder emails", () => {
    it("returns true for exact Superhuman reminder sender", () => {
      expect(isIgnoredSender("Reminder <reminder@superhuman.com>")).toBe(true);
    });
  });

  describe("case sensitivity", () => {
    it("returns false for different case", () => {
      expect(isIgnoredSender("reminder <reminder@superhuman.com>")).toBe(false);
    });
  });

  describe("other senders", () => {
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
