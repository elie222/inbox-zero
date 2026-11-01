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

  it("orders numeric prefixes naturally so 10 follows 9", () => {
    const labels = [
      { id: "label-10", name: "10. Cold Email" },
      { id: "label-2", name: "2. Needs Reply" },
      { id: "label-1", name: "1. Urgent" },
      { id: "label-9", name: "9. Marketing" },
    ];

    expect(labels.sort(compareLabelsByName).map((label) => label.name)).toEqual(
      ["1. Urgent", "2. Needs Reply", "9. Marketing", "10. Cold Email"],
    );
  });
});
