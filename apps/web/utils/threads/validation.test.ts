import { describe, expect, it } from "vitest";
import {
  threadsQuery,
  threadsQueryToSearchParams,
} from "@/utils/threads/validation";

describe("threadsQueryToSearchParams", () => {
  it("survives a round trip through the query string", () => {
    const anyOf = [
      { fromEmail: "notifications@linear.app" },
      { labelId: "Label_1" },
    ];
    const params = threadsQueryToSearchParams({
      labelIds: ["INBOX"],
      anyOf,
    });

    // String(anyOf) would silently send "[object Object]", which the route then
    // drops — leaving a "match any" split showing the whole inbox.
    expect(params.get("anyOf")).toBe(JSON.stringify(anyOf));
    expect(threadsQuery.parse({ anyOf: params.get("anyOf") }).anyOf).toEqual(
      anyOf,
    );
  });

  it("omits the parameter entirely when there are no branches", () => {
    expect(
      threadsQueryToSearchParams({ labelIds: ["INBOX"] }).has("anyOf"),
    ).toBe(false);
    expect(
      threadsQueryToSearchParams({ labelIds: ["INBOX"], anyOf: [] }).has(
        "anyOf",
      ),
    ).toBe(false);
  });

  it("drops an unparseable value rather than failing the request", () => {
    expect(threadsQuery.parse({ anyOf: "not json" }).anyOf).toBeUndefined();
  });
});
