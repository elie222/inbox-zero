import { describe, expect, it } from "vitest";
import { toCreateOrUpdateRuleCondition } from "./create-rule-condition";

describe("body condition update semantics", () => {
  it("preserves omission for callers that cannot edit body conditions", () => {
    const condition = toCreateOrUpdateRuleCondition({
      conditionalOperator: null,
      static: { from: "sender@example.com" },
    });
    expect(condition.static?.body).toBeUndefined();
  });

  it("keeps an explicit request to clear the body condition", () => {
    const condition = toCreateOrUpdateRuleCondition({
      conditionalOperator: null,
      static: { from: "sender@example.com", body: null },
    });
    expect(condition.static?.body).toBeNull();
  });
});
