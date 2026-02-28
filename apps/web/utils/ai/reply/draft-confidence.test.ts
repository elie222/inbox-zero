import { describe, expect, it } from "vitest";
import { DraftReplyConfidence } from "@/generated/prisma/enums";
import { normalizeDraftReplyConfidence } from "@/utils/ai/reply/draft-confidence";

describe("normalizeDraftReplyConfidence", () => {
  it("returns known enum values unchanged", () => {
    expect(normalizeDraftReplyConfidence(DraftReplyConfidence.ALL_EMAILS)).toBe(
      DraftReplyConfidence.ALL_EMAILS,
    );
    expect(normalizeDraftReplyConfidence(DraftReplyConfidence.STANDARD)).toBe(
      DraftReplyConfidence.STANDARD,
    );
    expect(
      normalizeDraftReplyConfidence(DraftReplyConfidence.HIGH_CONFIDENCE),
    ).toBe(DraftReplyConfidence.HIGH_CONFIDENCE);
  });

  it("defaults invalid and legacy values to ALL_EMAILS", () => {
    expect(normalizeDraftReplyConfidence(undefined)).toBe(
      DraftReplyConfidence.ALL_EMAILS,
    );
    expect(normalizeDraftReplyConfidence(null)).toBe(
      DraftReplyConfidence.ALL_EMAILS,
    );
    expect(normalizeDraftReplyConfidence("INVALID")).toBe(
      DraftReplyConfidence.ALL_EMAILS,
    );
    expect(normalizeDraftReplyConfidence(85)).toBe(
      DraftReplyConfidence.ALL_EMAILS,
    );
  });
});
