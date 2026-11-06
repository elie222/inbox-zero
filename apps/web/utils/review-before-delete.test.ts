import { describe, expect, it, vi } from "vitest";
import {
  getReviewBeforeDeleteLabel,
  isReservedReviewBypassLabel,
  isReviewBeforeDeleteEnabled,
} from "./review-before-delete";

vi.mock("@/env", () => ({
  env: {
    REVIEW_BEFORE_DELETE_LABEL: undefined,
  },
}));

describe("review-before-delete helpers", () => {
  it("identifies reserved review bypass labels", () => {
    expect(isReservedReviewBypassLabel("TRASH")).toBe(true);
    expect(isReservedReviewBypassLabel("trash")).toBe(true);
    expect(isReservedReviewBypassLabel(" SPAM ")).toBe(true);
    expect(isReservedReviewBypassLabel("spam")).toBe(true);

    expect(isReservedReviewBypassLabel("Review/Delete")).toBe(false);
    expect(isReservedReviewBypassLabel("Inbox")).toBe(false);
    expect(isReservedReviewBypassLabel("Work")).toBe(false);
  });

  it("returns undefined when REVIEW_BEFORE_DELETE_LABEL is not set", () => {
    expect(getReviewBeforeDeleteLabel()).toBeUndefined();
    expect(isReviewBeforeDeleteEnabled()).toBe(false);
  });
});
