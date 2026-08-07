import { describe, expect, it } from "vitest";
import { reconcileDigestSelection } from "./digest-selection";

describe("reconcileDigestSelection", () => {
  it("preserves unsaved edits when the server selection is unchanged", () => {
    const result = reconcileDigestSelection({
      currentSelection: new Set(["kept", "locally-added"]),
      previousServerSelection: new Set(["kept", "locally-removed"]),
      nextServerSelection: new Set(["kept", "locally-removed"]),
      availableRuleIds: new Set(["kept", "locally-added", "locally-removed"]),
    });

    expect(result).toEqual(new Set(["kept", "locally-added"]));
  });

  it("applies additions and removals received from the server", () => {
    const result = reconcileDigestSelection({
      currentSelection: new Set(["removed-by-server", "local-edit"]),
      previousServerSelection: new Set(["removed-by-server"]),
      nextServerSelection: new Set(["added-by-server"]),
      availableRuleIds: new Set([
        "removed-by-server",
        "added-by-server",
        "local-edit",
      ]),
    });

    expect(result).toEqual(new Set(["local-edit", "added-by-server"]));
  });

  it("drops selections for rules that no longer exist", () => {
    const result = reconcileDigestSelection({
      currentSelection: new Set(["existing", "deleted"]),
      previousServerSelection: new Set(["existing"]),
      nextServerSelection: new Set(["existing"]),
      availableRuleIds: new Set(["existing"]),
    });

    expect(result).toEqual(new Set(["existing"]));
  });
});
