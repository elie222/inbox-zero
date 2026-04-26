import { describe, expect, it } from "vitest";
import {
  buildQuotedPlainText,
  quotePlainTextContent,
} from "@/utils/email/quoted-plain-text";

describe("buildQuotedPlainText", () => {
  it("preserves intentional whitespace in provided sections", () => {
    const plainText = buildQuotedPlainText({
      textContent: "\n\nBest regards,\nJohn",
      quotedHeader: "On Thu, 6 Feb 2025 at 23:23, John Doe wrote:",
      quotedContent: "> Original message\n",
    });

    expect(plainText).toBe(
      "\n\nBest regards,\nJohn\n\nOn Thu, 6 Feb 2025 at 23:23, John Doe wrote:\n\n> Original message\n",
    );
  });

  it("omits separators for missing or empty sections", () => {
    const plainText = buildQuotedPlainText({
      textContent: "",
      quotedHeader: "On Thu, 6 Feb 2025 at 23:23, John Doe wrote:",
    });

    expect(plainText).toBe("On Thu, 6 Feb 2025 at 23:23, John Doe wrote:");
  });
});

describe("quotePlainTextContent", () => {
  it("returns undefined when plain text content is missing", () => {
    expect(quotePlainTextContent()).toBeUndefined();
  });

  it("prefixes each line with a quote marker", () => {
    expect(quotePlainTextContent("First line\nSecond line")).toBe(
      "> First line\n> Second line",
    );
  });
});
