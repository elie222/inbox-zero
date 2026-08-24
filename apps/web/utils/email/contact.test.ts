import { describe, expect, it } from "vitest";
import { normalizeContactCandidates } from "./contact";

describe("normalizeContactCandidates", () => {
  it("removes invalid and duplicate addresses while preserving provider order", () => {
    expect(
      normalizeContactCandidates([
        { emailAddress: " first@example.com ", name: "First" },
        { emailAddress: "FIRST@example.com", name: "Duplicate" },
        { emailAddress: "not-an-email", name: "Invalid" },
        { emailAddress: "second@example.com", name: "Second" },
      ]),
    ).toEqual([
      { emailAddress: "first@example.com", name: "First" },
      { emailAddress: "second@example.com", name: "Second" },
    ]);
  });

  it("limits the number of suggestions", () => {
    expect(
      normalizeContactCandidates(
        [
          { emailAddress: "first@example.com" },
          { emailAddress: "second@example.com" },
        ],
        1,
      ),
    ).toEqual([{ emailAddress: "first@example.com" }]);
  });
});
