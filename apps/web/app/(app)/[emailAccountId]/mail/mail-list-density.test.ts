import { describe, expect, it } from "vitest";
import { getMailListSnippetClassName } from "@/app/(app)/[emailAccountId]/mail/mail-list-density";

describe("getMailListSnippetClassName", () => {
  it("keeps compact snippets on a single truncated line", () => {
    expect(
      getMailListSnippetClassName({ density: "compact", variant: "wide" }),
    ).toContain("truncate");
    expect(
      getMailListSnippetClassName({ density: "compact", variant: "stacked" }),
    ).toContain("truncate");
  });

  it("clamps expanded snippets to about five lines", () => {
    expect(
      getMailListSnippetClassName({ density: "expanded", variant: "wide" }),
    ).toContain("line-clamp-5");
    expect(
      getMailListSnippetClassName({ density: "expanded", variant: "stacked" }),
    ).toContain("line-clamp-5");
  });
});
