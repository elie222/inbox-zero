import { describe, expect, it } from "vitest";
import {
  filterSnippets,
  initialSnippetSelectionIndex,
  type SnippetMatchItem,
} from "./match-snippets";

const snippets: SnippetMatchItem[] = [
  {
    id: "1",
    shortcut: "thanks",
    content: "Thanks for taking the time.",
  },
  {
    id: "2",
    shortcut: "avail",
    content: "I am free Thursday afternoon.",
  },
  {
    id: "3",
    shortcut: "followup",
    content: "Checking in on the notes from last week.",
  },
];

describe("filterSnippets", () => {
  it("returns all snippets for an empty query", () => {
    expect(
      filterSnippets(snippets, "").map((snippet) => snippet.shortcut),
    ).toEqual(["avail", "followup", "thanks"]);
  });

  it("ranks an exact shortcut match first", () => {
    expect(
      filterSnippets(snippets, "/THANKS").map((snippet) => snippet.shortcut),
    ).toEqual(["thanks"]);
  });

  it("matches body text", () => {
    expect(
      filterSnippets(snippets, "thursday").map((snippet) => snippet.shortcut),
    ).toEqual(["avail"]);
    expect(
      filterSnippets(snippets, "follow").map((snippet) => snippet.shortcut),
    ).toEqual(["followup"]);
  });
});

describe("initialSnippetSelectionIndex", () => {
  it("selects the first matching snippet when the query looks like a shortcut", () => {
    expect(
      initialSnippetSelectionIndex({
        createItem: true,
        query: "fol",
        snippets: filterSnippets(snippets, "fol"),
      }),
    ).toBe(1);
  });

  it("selects create when nothing matches the query", () => {
    expect(
      initialSnippetSelectionIndex({
        createItem: true,
        query: "xyz",
        snippets,
      }),
    ).toBe(0);
  });

  it("selects the first snippet when opening with no query", () => {
    expect(
      initialSnippetSelectionIndex({
        createItem: true,
        query: "",
        snippets,
      }),
    ).toBe(1);
  });
});
