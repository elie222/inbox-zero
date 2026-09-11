import { describe, expect, it } from "vitest";
import { OUTLOOK_CATEGORY_COLORS } from "./category-colors";

describe("Outlook category colors", () => {
  it.each([
    ["preset2", "Brown"],
    ["preset3", "Yellow"],
    ["preset4", "Green"],
    ["preset5", "Teal"],
    ["preset6", "Olive"],
    ["preset7", "Blue"],
    ["preset8", "Purple"],
    ["preset9", "Cranberry"],
  ])("maps %s to the documented %s category color", (id, name) => {
    expect(OUTLOOK_CATEGORY_COLORS.find((color) => color.id === id)?.name).toBe(
      name,
    );
  });
});
