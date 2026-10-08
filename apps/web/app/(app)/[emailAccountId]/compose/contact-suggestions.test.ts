import { describe, expect, it } from "vitest";
import { mergeContactSuggestions } from "./contact-suggestions";

describe("mergeContactSuggestions", () => {
  it("keeps local ranking, dedupes API addresses ignoring case, excludes selected and caps", () => {
    expect(
      mergeContactSuggestions(
        [
          { emailAddress: "local@example.com", name: "Local" },
          { emailAddress: "both@example.com", name: "Cached" },
        ],
        [
          { emailAddress: "BOTH@example.com", name: "API" },
          { emailAddress: "api@example.com", name: "API only" },
          { emailAddress: "selected@example.com" },
        ],
        new Set(["selected@example.com"]),
      ),
    ).toEqual([
      { emailAddress: "local@example.com", name: "Local" },
      { emailAddress: "both@example.com", name: "Cached" },
      { emailAddress: "api@example.com", name: "API only" },
    ]);
    expect(
      mergeContactSuggestions(
        Array.from({ length: 20 }, (_, i) => ({
          emailAddress: `${i}@example.com`,
        })),
        [],
        new Set(),
      ),
    ).toHaveLength(6);
  });

  it("caps local suggestions at six while preserving the eight-result merged and API-only caps", () => {
    const local = Array.from({ length: 10 }, (_, i) => ({
      emailAddress: `local${i}@example.com`,
    }));
    const api = Array.from({ length: 10 }, (_, i) => ({
      emailAddress: `api${i}@example.com`,
    }));
    expect(mergeContactSuggestions(local, api, new Set())).toEqual([
      ...local.slice(0, 6),
      ...api.slice(0, 2),
    ]);
    expect(mergeContactSuggestions([], api, new Set())).toEqual(
      api.slice(0, 8),
    );
  });
});
