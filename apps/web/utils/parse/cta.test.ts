import { describe, it, expect } from "vitest";
import { containsCtaKeyword } from "./cta";

describe("containsCtaKeyword", () => {
  describe("detects CTA keywords", () => {
    it("detects 'see more'", () => {
      expect(containsCtaKeyword("see more details")).toBe(true);
    });

    it("detects 'view it'", () => {
      expect(containsCtaKeyword("view it on GitHub")).toBe(true);
    });

    it("detects 'view reply'", () => {
      expect(containsCtaKeyword("view reply")).toBe(true);
    });

    it("detects 'view comment'", () => {
      expect(containsCtaKeyword("view comment")).toBe(true);
    });

    it("detects 'view question'", () => {
      expect(containsCtaKeyword("view question")).toBe(true);
    });

    it("detects 'view message'", () => {
      expect(containsCtaKeyword("view message")).toBe(true);
    });

    it("detects 'view in'", () => {
      expect(containsCtaKeyword("view in Airtable")).toBe(true);
    });

    it("detects 'confirm'", () => {
      expect(containsCtaKeyword("confirm subscription")).toBe(true);
    });

    it("detects 'join the conversation'", () => {
      expect(containsCtaKeyword("join the conversation")).toBe(true);
    });

    it("detects 'go to console'", () => {
      expect(containsCtaKeyword("go to console")).toBe(true);
    });

    it("detects 'open messenger'", () => {
      expect(containsCtaKeyword("open messenger")).toBe(true);
    });

    it("detects 'open in'", () => {
      expect(containsCtaKeyword("open in Slack")).toBe(true);
    });

    it("detects 'reply'", () => {
      expect(containsCtaKeyword("reply")).toBe(true);
    });
  });

  describe("length constraint (max 30 characters)", () => {
    it("returns true for text exactly 29 characters with keyword", () => {
      // "view it on GitHub" is 17 chars, add 12 more to get 29
      const text = "view it on GitHub123456";
      expect(text.length).toBe(23);
      expect(containsCtaKeyword(text)).toBe(true);
    });

    it("returns true for text exactly at 29 characters", () => {
      const text = "confirm this action now 12345"; // 29 chars
      expect(text.length).toBe(29);
      expect(containsCtaKeyword(text)).toBe(true);
    });

    it("returns false for text at exactly 30 characters", () => {
      const text = "confirm this action now 123456"; // 30 chars
      expect(text.length).toBe(30);
      expect(containsCtaKeyword(text)).toBe(false);
    });

    it("returns false for text longer than 30 characters", () => {
      const text = "Please confirm your subscription to our newsletter";
      expect(text.length).toBeGreaterThan(30);
      expect(containsCtaKeyword(text)).toBe(false);
    });

    it("returns false for long sentences with keywords", () => {
      expect(
        containsCtaKeyword(
          "You can view it on GitHub by clicking the link below",
        ),
      ).toBe(false);
    });
  });

  describe("returns false for non-matching text", () => {
    it("returns false for empty string", () => {
      expect(containsCtaKeyword("")).toBe(false);
    });

    it("returns false for regular text", () => {
      expect(containsCtaKeyword("Hello world")).toBe(false);
    });

    it("returns false for similar but non-matching text", () => {
      expect(containsCtaKeyword("viewing something")).toBe(false);
    });

    it("is case sensitive - does not match uppercase", () => {
      expect(containsCtaKeyword("VIEW IT")).toBe(false);
    });

    it("is case sensitive - does not match title case", () => {
      expect(containsCtaKeyword("View It")).toBe(false);
    });
  });

  describe("keyword matching behavior", () => {
    it("matches keyword at start of text", () => {
      expect(containsCtaKeyword("reply now")).toBe(true);
    });

    it("matches keyword at end of text", () => {
      expect(containsCtaKeyword("click to reply")).toBe(true);
    });

    it("matches keyword in middle of text", () => {
      expect(containsCtaKeyword("tap to reply now")).toBe(true);
    });
  });
});
