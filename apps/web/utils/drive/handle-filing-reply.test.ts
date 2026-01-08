import { describe, it, expect } from "vitest";

// These are private functions, so we need to export them for testing
// For now, we'll test via the module's behavior
// But ideally these would be exported or extracted

describe("parseFolderPath", () => {
  // Since parseFolderPath is not exported, we test the logic inline
  const parseFolderPath = (content: string): string | null => {
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith(">") && !trimmed.startsWith("On ")) {
        const cleaned = trimmed
          .replace(/^(put it in|move to|file to|folder:?)\s*/i, "")
          .replace(/^["']|["']$/g, "")
          .trim();

        if (cleaned) {
          return cleaned;
        }
      }
    }

    return null;
  };

  it("should parse a simple folder path", () => {
    expect(parseFolderPath("Receipts/2024")).toBe("Receipts/2024");
  });

  it("should parse folder path with 'put it in' prefix", () => {
    expect(parseFolderPath("Put it in Receipts/2024")).toBe("Receipts/2024");
  });

  it("should parse folder path with 'move to' prefix", () => {
    expect(parseFolderPath("Move to Projects/ClientA")).toBe(
      "Projects/ClientA",
    );
  });

  it("should parse folder path with 'file to' prefix", () => {
    expect(parseFolderPath("File to Documents")).toBe("Documents");
  });

  it("should parse folder path with 'folder:' prefix", () => {
    expect(parseFolderPath("Folder: Invoices/2024")).toBe("Invoices/2024");
  });

  it("should remove quotes around path", () => {
    expect(parseFolderPath('"Receipts/December"')).toBe("Receipts/December");
    expect(parseFolderPath("'Projects/Acme'")).toBe("Projects/Acme");
  });

  it("should skip quoted reply lines", () => {
    const content = `> Original message here
Receipts/2024`;
    expect(parseFolderPath(content)).toBe("Receipts/2024");
  });

  it("should skip 'On ... wrote:' lines", () => {
    const content = `On Mon, Jan 1, 2024 at 10:00 AM User wrote:
Receipts/2024`;
    expect(parseFolderPath(content)).toBe("Receipts/2024");
  });

  it("should handle multiline with first valid line", () => {
    const content = `
Receipts/2024
This is where I want it
`;
    expect(parseFolderPath(content)).toBe("Receipts/2024");
  });

  it("should return null for empty content", () => {
    expect(parseFolderPath("")).toBeNull();
  });

  it("should return null for only quoted content", () => {
    expect(parseFolderPath("> quoted text only")).toBeNull();
  });
});

describe("isSkipCommand", () => {
  const isSkipCommand = (content: string): boolean => {
    const normalized = content.toLowerCase().trim();
    return (
      normalized === "skip" ||
      normalized === "ignore" ||
      normalized === "no" ||
      normalized === "don't file" ||
      normalized === "dont file"
    );
  };

  it("should recognize 'skip'", () => {
    expect(isSkipCommand("skip")).toBe(true);
    expect(isSkipCommand("Skip")).toBe(true);
    expect(isSkipCommand("SKIP")).toBe(true);
    expect(isSkipCommand("  skip  ")).toBe(true);
  });

  it("should recognize 'ignore'", () => {
    expect(isSkipCommand("ignore")).toBe(true);
    expect(isSkipCommand("Ignore")).toBe(true);
  });

  it("should recognize 'no'", () => {
    expect(isSkipCommand("no")).toBe(true);
    expect(isSkipCommand("No")).toBe(true);
  });

  it("should recognize 'don't file'", () => {
    expect(isSkipCommand("don't file")).toBe(true);
    expect(isSkipCommand("Don't file")).toBe(true);
  });

  it("should recognize 'dont file'", () => {
    expect(isSkipCommand("dont file")).toBe(true);
    expect(isSkipCommand("Dont file")).toBe(true);
  });

  it("should not match partial commands", () => {
    expect(isSkipCommand("skip this")).toBe(false);
    expect(isSkipCommand("please skip")).toBe(false);
    expect(isSkipCommand("nope")).toBe(false);
  });

  it("should not match folder paths", () => {
    expect(isSkipCommand("Receipts/2024")).toBe(false);
    expect(isSkipCommand("Documents")).toBe(false);
  });
});
