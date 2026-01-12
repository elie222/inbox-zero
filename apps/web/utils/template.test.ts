import { describe, it, expect } from "vitest";
import { hasVariables, TEMPLATE_VARIABLE_PATTERN } from "./template";

describe("TEMPLATE_VARIABLE_PATTERN", () => {
  it("matches simple variable", () => {
    const regex = new RegExp(TEMPLATE_VARIABLE_PATTERN);
    expect(regex.test("{{name}}")).toBe(true);
  });

  it("matches variable with spaces", () => {
    const regex = new RegExp(TEMPLATE_VARIABLE_PATTERN);
    expect(regex.test("{{ name }}")).toBe(true);
  });

  it("matches multiline variable", () => {
    const regex = new RegExp(TEMPLATE_VARIABLE_PATTERN);
    expect(regex.test("{{\nname\n}}")).toBe(true);
  });

  it("does not match single braces", () => {
    const regex = new RegExp(TEMPLATE_VARIABLE_PATTERN);
    expect(regex.test("{name}")).toBe(false);
  });
});

describe("hasVariables", () => {
  describe("returns true for text with variables", () => {
    it("detects simple variable", () => {
      expect(hasVariables("Hello {{name}}")).toBe(true);
    });

    it("detects variable with spaces inside", () => {
      expect(hasVariables("Hello {{ name }}")).toBe(true);
    });

    it("detects multiple variables", () => {
      expect(hasVariables("{{greeting}} {{name}}!")).toBe(true);
    });

    it("detects variable at start", () => {
      expect(hasVariables("{{name}} said hello")).toBe(true);
    });

    it("detects variable at end", () => {
      expect(hasVariables("Hello {{name}}")).toBe(true);
    });

    it("detects nested-looking content", () => {
      expect(hasVariables("{{outer {{inner}}}}")).toBe(true);
    });

    it("detects variable with underscores", () => {
      expect(hasVariables("{{first_name}}")).toBe(true);
    });

    it("detects variable with dots", () => {
      expect(hasVariables("{{user.name}}")).toBe(true);
    });

    it("detects multiline variable", () => {
      expect(hasVariables("Hello {{\nname\n}}")).toBe(true);
    });

    it("detects empty variable", () => {
      expect(hasVariables("{{}}")).toBe(true);
    });
  });

  describe("returns false for text without variables", () => {
    it("returns false for plain text", () => {
      expect(hasVariables("Hello world")).toBe(false);
    });

    it("returns false for single braces", () => {
      expect(hasVariables("Hello {name}")).toBe(false);
    });

    it("returns false for unmatched opening braces", () => {
      expect(hasVariables("Hello {{name")).toBe(false);
    });

    it("returns false for unmatched closing braces", () => {
      expect(hasVariables("Hello name}}")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(hasVariables("")).toBe(false);
    });

    it("returns false for braces with space between", () => {
      expect(hasVariables("{ {name} }")).toBe(false);
    });
  });

  describe("handles null and undefined", () => {
    it("returns false for null", () => {
      expect(hasVariables(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(hasVariables(undefined)).toBe(false);
    });
  });
});
