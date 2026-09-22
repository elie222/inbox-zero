import { describe, expect, it } from "vitest";
import { compilePredicate } from "./queries";

describe("compilePredicate", () => {
  it("guards scoped membership predicates by account", () => {
    expect(
      compilePredicate({
        kind: "membership",
        membership: "label",
        id: "shared-id",
        accountId: "acc-1",
      }),
    ).toEqual({
      sql: "(e.account_id = ? AND EXISTS (SELECT 1 FROM json_each(e.label_ids_json) WHERE value = ?))",
      bindings: ["acc-1", "shared-id"],
    });

    expect(
      compilePredicate({
        kind: "membership",
        membership: "folder",
        id: "folder-1",
        accountId: "acc-1",
      }),
    ).toEqual({
      sql: "(e.account_id = ? AND e.folder_id = ?)",
      bindings: ["acc-1", "folder-1"],
    });

    expect(
      compilePredicate({
        kind: "membership",
        membership: "category",
        id: "CATEGORY_PROMOTIONS",
        accountId: "acc-1",
      }),
    ).toEqual({
      sql: "(e.account_id = ? AND EXISTS (SELECT 1 FROM json_each(e.category_ids_json) WHERE value = ?))",
      bindings: ["acc-1", "CATEGORY_PROMOTIONS"],
    });
  });
});
