import { describe, it, expect } from "vitest";
import { escapeODataString } from "@/utils/outlook/odata-escape";

describe("OData String Escaping", () => {
  it("should escape single quotes by doubling them", () => {
    expect(escapeODataString("O'Brien")).toBe("O''Brien");
    expect(escapeODataString("test' or 1=1 --")).toBe("test'' or 1=1 --");
    expect(escapeODataString("it's a test")).toBe("it''s a test");
  });

  it("should handle strings without quotes", () => {
    expect(escapeODataString("normal string")).toBe("normal string");
    expect(escapeODataString("test@example.com")).toBe("test@example.com");
  });

  it("should handle multiple quotes", () => {
    expect(escapeODataString("'test'")).toBe("''test''");
    expect(escapeODataString("test's 'quoted' text")).toBe(
      "test''s ''quoted'' text",
    );
  });

  it("should handle empty strings", () => {
    expect(escapeODataString("")).toBe("");
  });

  it("should handle non-string inputs safely", () => {
    expect(escapeODataString(null as any)).toBe("");
    expect(escapeODataString(undefined as any)).toBe("");
    expect(escapeODataString(123 as any)).toBe("");
  });

  it("should prevent OData injection attacks", () => {
    // Simulated malicious inputs
    const maliciousEmail = "attacker@example.com' or subject eq 'sensitive";
    const escaped = escapeODataString(maliciousEmail);

    // The escaped version should have doubled quotes
    expect(escaped).toBe("attacker@example.com'' or subject eq ''sensitive");

    // When used in a filter, it should be safe
    const filter = `from/emailAddress/address eq '${escaped}'`;
    expect(filter).toBe(
      "from/emailAddress/address eq 'attacker@example.com'' or subject eq ''sensitive'",
    );

    // The filter should not allow breaking out of the string literal
    // Check that there are no unescaped single quotes followed by " or "
    // (All quotes should be doubled, so we shouldn't see a single quote followed by " or ")
    expect(filter).toContain(
      "attacker@example.com'' or subject eq ''sensitive",
    );
    // Verify the malicious pattern has been neutralized
    expect(filter).toBe(
      "from/emailAddress/address eq 'attacker@example.com'' or subject eq ''sensitive'",
    );
  });
});
