import { describe, expect, it } from "vitest";
import { findOrderPrefixedLabelMatches } from "./find-order-prefixed-label-matches";
import { normalizeLabelName } from "./normalize-label-name";

const labels = [
  { id: "1", name: "1: To Reply" },
  { id: "2", name: "7. OG" },
  { id: "3", name: "04 Archives" },
  { id: "4", name: "OG" },
  { id: "5", name: "2024 Taxes" },
  { id: "6", name: "Receipts" },
];

const find = (name: string) =>
  findOrderPrefixedLabelMatches({
    labels,
    name,
    getLabelName: (label) => label.name,
    normalize: normalizeLabelName,
  }).map((label) => label.id);

describe("findOrderPrefixedLabelMatches", () => {
  it("matches labels that only differ by a leading order prefix", () => {
    expect(find("To Reply")).toEqual(["1"]);
    expect(find("og")).toEqual(["2"]);
    expect(find("Archives")).toEqual(["3"]);
  });

  it("does not treat a four digit year as an order prefix", () => {
    expect(find("Taxes")).toEqual([]);
  });

  it("excludes exact matches and unrelated labels", () => {
    expect(find("Receipts")).toEqual([]);
    expect(find("Invoices")).toEqual([]);
  });
});
