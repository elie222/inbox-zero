import { describe, expect, it } from "vitest";
import { compareLabelsByName } from "./compare-labels";

describe("compareLabelsByName", () => {
  it("uses consistent English collation for non-ASCII labels", () => {
    const labels = [
      { id: "label-zulu", name: "Zulu" },
      { id: "label-angstrom", name: "Ångström" },
    ];

    expect(labels.sort(compareLabelsByName).map((label) => label.name)).toEqual(
      ["Ångström", "Zulu"],
    );
  });
});
