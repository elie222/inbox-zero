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
});

describe("getDocumentPreview", () => {
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
  it("should handle combined cases", () => {
    // Note: the function collapses whitespace but doesn't trim line endings
    const input = "  line1\r\n\r\n\r\nline2  \t\tword  \n\n\nline3  ";
    const expected = "line1\n\nline2 word \n\nline3";
    expect(cleanExtractedText(input)).toBe(expected);
  });

  it("should handle empty string", () => {
    expect(cleanExtractedText("")).toBe("");
  });
});
