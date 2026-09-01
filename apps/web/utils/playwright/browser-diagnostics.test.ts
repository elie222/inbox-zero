import { describe, expect, it } from "vitest";
import { sanitizeBrowserDiagnosticText } from "./browser-diagnostics";

describe("sanitizeBrowserDiagnosticText", () => {
  it("redacts credentials and mailbox addresses from diagnostic evidence", () => {
    const token = "x".repeat(24);
    const text = `Request failed for user@example.com with Bearer ${token}`;

    const sanitized = sanitizeBrowserDiagnosticText(text);

    expect(sanitized).toBe(
      "Request failed for [REDACTED:EMAIL] with Bearer [REDACTED:CREDENTIAL]",
    );
    expect(sanitized).not.toContain(token);
    expect(sanitized).not.toContain("user@example.com");
  });

  it("truncates after redaction", () => {
    const token = "x".repeat(24);
    const sanitized = sanitizeBrowserDiagnosticText(
      `token=${token} ${"a".repeat(2100)}`,
    );

    expect(sanitized).toHaveLength(2001);
    expect(sanitized).toContain("[REDACTED:CREDENTIAL]");
    expect(sanitized).not.toContain(token);
    expect(sanitized.endsWith("…")).toBe(true);
  });
});
