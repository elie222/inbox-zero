import { describe, it, expect } from "vitest";
import {
  isExtractableMimeType,
  canUseNativePdfSupport,
  getDocumentPreview,
  cleanExtractedText,
} from "./document-extraction";

describe("isExtractableMimeType", () => {
  it("should return true for PDF", () => {
    expect(isExtractableMimeType("application/pdf")).toBe(true);
  });

  it("should return true for DOCX", () => {
    expect(
      isExtractableMimeType(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(true);
  });

  it("should return true for plain text", () => {
    expect(isExtractableMimeType("text/plain")).toBe(true);
  });

  it("should return false for unsupported types", () => {
    expect(isExtractableMimeType("image/png")).toBe(false);
    expect(isExtractableMimeType("application/json")).toBe(false);
    expect(isExtractableMimeType("video/mp4")).toBe(false);
    expect(isExtractableMimeType("application/msword")).toBe(false); // .doc not supported
  });

  it("should return false for empty string", () => {
    expect(isExtractableMimeType("")).toBe(false);
  });
});

describe("canUseNativePdfSupport", () => {
  it("should return true for small PDF under limits", () => {
    const smallBuffer = Buffer.alloc(1024); // 1KB
    expect(canUseNativePdfSupport(smallBuffer, 10)).toBe(true);
  });

  it("should return true when pageCount is undefined", () => {
    const smallBuffer = Buffer.alloc(1024);
    expect(canUseNativePdfSupport(smallBuffer)).toBe(true);
  });

  it("should return false for PDF over 32MB", () => {
    const largeBuffer = Buffer.alloc(33 * 1024 * 1024); // 33MB
    expect(canUseNativePdfSupport(largeBuffer, 10)).toBe(false);
  });

  it("should return false for PDF over 100 pages", () => {
    const smallBuffer = Buffer.alloc(1024);
    expect(canUseNativePdfSupport(smallBuffer, 101)).toBe(false);
  });

  it("should return true at exactly 100 pages", () => {
    const smallBuffer = Buffer.alloc(1024);
    expect(canUseNativePdfSupport(smallBuffer, 100)).toBe(true);
  });

  it("should return false when both limits exceeded", () => {
    const largeBuffer = Buffer.alloc(33 * 1024 * 1024);
    expect(canUseNativePdfSupport(largeBuffer, 150)).toBe(false);
  });
});

describe("getDocumentPreview", () => {
  it("should return full text if under limit", () => {
    expect(getDocumentPreview("Hello world", 200)).toBe("Hello world");
  });

  it("should truncate and add ellipsis if over limit", () => {
    const text = "a".repeat(300);
    const preview = getDocumentPreview(text, 200);
    expect(preview).toBe(`${"a".repeat(200)}...`);
    expect(preview.length).toBe(203);
  });

  it("should use default length of 200", () => {
    const text = "a".repeat(300);
    const preview = getDocumentPreview(text);
    expect(preview).toBe(`${"a".repeat(200)}...`);
  });

  it("should return exact text at limit", () => {
    const text = "a".repeat(200);
    expect(getDocumentPreview(text, 200)).toBe(text);
  });

  it("should handle empty string", () => {
    expect(getDocumentPreview("")).toBe("");
  });
});

describe("cleanExtractedText", () => {
  it("should normalize CRLF to LF", () => {
    expect(cleanExtractedText("line1\r\nline2")).toBe("line1\nline2");
  });

  it("should collapse multiple newlines to max 2", () => {
    expect(cleanExtractedText("line1\n\n\n\nline2")).toBe("line1\n\nline2");
  });

  it("should collapse horizontal whitespace", () => {
    expect(cleanExtractedText("word1    word2\t\tword3")).toBe(
      "word1 word2 word3",
    );
  });

  it("should trim leading and trailing whitespace", () => {
    expect(cleanExtractedText("  hello world  ")).toBe("hello world");
  });

  it("should handle combined cases", () => {
    // Note: the function collapses whitespace but doesn't trim line endings
    const input = "  line1\r\n\r\n\r\nline2    word  \n\n\nline3  ";
    const expected = "line1\n\nline2 word \n\nline3";
    expect(cleanExtractedText(input)).toBe(expected);
  });

  it("should handle empty string", () => {
    expect(cleanExtractedText("")).toBe("");
  });
});
