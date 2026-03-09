import { describe, expect, it } from "vitest";
import { findLabelByName } from "./find-label-by-name";

describe("findLabelByName", () => {
  it("finds a label by normalized name", () => {
    const labels = [
      { id: "1", name: "Reference / Political activism" },
      { id: "2", name: "Reference / Other" },
    ];

    const label = findLabelByName({
      labels,
      name: "Reference/Political activism",
      getLabelName: (entry) => entry.name,
      normalize: (value) => value.toLowerCase().replace(/\s*\/\s*/g, "/"),
    });

    expect(label?.id).toBe("1");
  });

  it("returns undefined when no normalized match exists", () => {
    const labels = [{ id: "1", name: "Reference/Other" }];

    const label = findLabelByName({
      labels,
      name: "Reference/Political activism",
      getLabelName: (entry) => entry.name,
      normalize: (value) => value.toLowerCase(),
    });

    expect(label).toBeUndefined();
  });
});
