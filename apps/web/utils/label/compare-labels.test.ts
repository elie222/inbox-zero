import { afterEach, describe, expect, it, vi } from "vitest";
import { compareLabelsByName } from "./compare-labels";

describe("compareLabelsByName", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses English collation when the runtime default is Swedish", () => {
    const localeCompare = String.prototype.localeCompare;
    vi.spyOn(String.prototype, "localeCompare").mockImplementation(function (
      this: string,
      compareString,
      locales,
      options,
    ) {
      return localeCompare.call(this, compareString, locales ?? "sv", options);
    });

    const labels = [
      { id: "label-zulu", name: "Zulu" },
      { id: "label-angstrom", name: "Ångström" },
    ];

    expect(labels.sort(compareLabelsByName).map((label) => label.name)).toEqual(
      ["Ångström", "Zulu"],
    );
  });
});
