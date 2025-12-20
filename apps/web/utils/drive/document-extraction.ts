/**
 * Document text extraction utilities for PDF and DOCX files.
 *
 * Used to extract text content from email attachments before
 * sending to AI for document classification.
 *
 * Uses `unpdf` for PDF extraction - serverless/edge compatible.
 * Uses `mammoth` for DOCX extraction.
 *
 * Architecture note (from CRE document research):
 * - Hybrid approach (OCR/extraction → LLM reasoning) outperforms vision-only
 * - For small PDFs (<10 pages), consider using Claude's native PDF support
 */

import type { Logger } from "@/utils/logger";

// ============================================================================
// Types
// ============================================================================

export interface ExtractionResult {
  text: string;
  pageCount?: number;
  truncated: boolean;
}

export interface ExtractionOptions {
  /** Maximum characters to extract (default: 10000) */
  maxLength?: number;
  /** Maximum pages to process for PDFs (default: 50) */
  maxPages?: number;
  /** Logger for debugging */
  logger?: Logger;
}

// Supported MIME types for extraction
export const EXTRACTABLE_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/msword", // .doc (limited support)
  "text/plain",
] as const;

export type ExtractableMimeType = (typeof EXTRACTABLE_MIME_TYPES)[number];

// ============================================================================
// Main Extraction Function
// ============================================================================

/**
 * Extract text from a document buffer based on MIME type.
 * Returns null if the MIME type is not supported.
 */
export async function extractTextFromDocument(
  buffer: Buffer,
  mimeType: string,
  options: ExtractionOptions = {},
): Promise<ExtractionResult | null> {
  const { maxLength = 10_000, maxPages = 50, logger } = options;

  try {
    switch (mimeType) {
      case "application/pdf":
        return await extractFromPdf(buffer, maxLength, maxPages, logger);

      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return await extractFromDocx(buffer, maxLength, logger);

      case "text/plain":
        return extractFromPlainText(buffer, maxLength);

      default:
        logger?.info("Unsupported MIME type for extraction", { mimeType });
        return null;
    }
  } catch (error) {
    logger?.error("Error extracting text from document", { error, mimeType });
    return null;
  }
}

/**
 * Check if a MIME type is supported for extraction.
 */
export function isExtractableMimeType(mimeType: string): boolean {
  return EXTRACTABLE_MIME_TYPES.includes(mimeType as ExtractableMimeType);
}

/**
 * Check if a PDF is small enough for Claude's native PDF support.
 * Claude can process PDFs natively up to 100 pages / 32MB.
 * For small documents, this can be more accurate than text extraction.
 */
export function canUseNativePdfSupport(
  buffer: Buffer,
  pageCount?: number,
): boolean {
  const MAX_SIZE_MB = 32;
  const MAX_PAGES = 100;

  const sizeOk = buffer.length < MAX_SIZE_MB * 1024 * 1024;
  const pagesOk = !pageCount || pageCount <= MAX_PAGES;

  return sizeOk && pagesOk;
}

// ============================================================================
// PDF Extraction (using unpdf - serverless compatible)
// ============================================================================

async function extractFromPdf(
  buffer: Buffer,
  maxLength: number,
  maxPages: number,
  logger?: Logger,
): Promise<ExtractionResult> {
  // Dynamic import for unpdf (serverless/edge compatible)
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error - unpdf types available after install: pnpm add unpdf --filter web
  const { getDocumentProxy } = await import("unpdf");

  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const pageCount = pdf.numPages;
  const pagesToProcess = Math.min(pageCount, maxPages);

  const textParts: string[] = [];
  let totalLength = 0;
  let truncated = false;

  for (let i = 1; i <= pagesToProcess && !truncated; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    // Extract text items and join them
    const pageText = (textContent.items as Array<{ str?: string }>)
      .map((item) => item.str ?? "")
      .join(" ");

    if (totalLength + pageText.length > maxLength) {
      // Truncate to fit within maxLength
      const remaining = maxLength - totalLength;
      textParts.push(pageText.slice(0, remaining));
      truncated = true;
    } else {
      textParts.push(pageText);
      totalLength += pageText.length;
    }
  }

  // Check if we hit page limit
  if (pagesToProcess < pageCount) {
    truncated = true;
  }

  const text = textParts.join("\n\n");

  logger?.info("PDF extraction complete", {
    pageCount,
    pagesProcessed: pagesToProcess,
    textLength: text.length,
    truncated,
  });

  return {
    text,
    pageCount,
    truncated,
  };
}

// ============================================================================
// DOCX Extraction
// ============================================================================

async function extractFromDocx(
  buffer: Buffer,
  maxLength: number,
  logger?: Logger,
): Promise<ExtractionResult> {
  // Dynamic import to avoid loading the library if not needed
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error - mammoth types available after install: pnpm add mammoth --filter web
  const mammoth = await import("mammoth");

  const result = await mammoth.extractRawText({ buffer });
  const text = result.value || "";
  const truncated = text.length > maxLength;

  logger?.info("DOCX extraction complete", {
    textLength: text.length,
    truncated,
    messages: result.messages,
  });

  return {
    text: truncated ? text.slice(0, maxLength) : text,
    truncated,
  };
}

// ============================================================================
// Plain Text Extraction
// ============================================================================

function extractFromPlainText(
  buffer: Buffer,
  maxLength: number,
): ExtractionResult {
  const text = buffer.toString("utf-8");
  const truncated = text.length > maxLength;

  return {
    text: truncated ? text.slice(0, maxLength) : text,
    truncated,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get a preview of the document (first N characters).
 * Useful for logging without exposing full content.
 */
export function getDocumentPreview(text: string, length = 200): string {
  if (text.length <= length) return text;
  return `${text.slice(0, length)}...`;
}

/**
 * Clean extracted text by removing excessive whitespace.
 */
export function cleanExtractedText(text: string): string {
  return text
    .replace(/\r\n/g, "\n") // Normalize line endings
    .replace(/\n{3,}/g, "\n\n") // Max 2 consecutive newlines
    .replace(/[ \t]+/g, " ") // Collapse horizontal whitespace
    .trim();
}
