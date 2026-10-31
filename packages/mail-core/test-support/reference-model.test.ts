import { describe, expect, it } from "vitest";
import {
  applyReferenceChange,
  createReferenceModel,
  referenceMailbox,
  setReferencePending,
} from "../test-support/reference-model";
import { archiveThenNewMailScenario } from "../test-support/scenarios";

describe("reference model archive scenario", () => {
  it("hides an archived conversation then returns it when new mail arrives", () => {
    const state = createReferenceModel();
    const inbox = { kind: "role" as const, role: "inbox" as const };
    for (const event of archiveThenNewMailScenario) {
      if (event.kind === "observe") applyReferenceChange(state, event.change);
      if (event.kind === "admit") {
        setReferencePending(state, [
          ...state.pending,
          {
            operationId: event.operationId,
            change: event.change,
            targets: event.targets,
          },
        ]);
      }
      if (event.kind === "clearPending") {
        setReferencePending(
          state,
          state.pending.filter(
            (item) => item.operationId !== event.operationId,
          ),
        );
      }
    }
    const view = referenceMailbox(state, ["a1"], inbox);
    expect(view.conversations).toEqual(["a1:c1"]);
    expect(view.matchingConversations).toBe(1);
    expect(view.unreadConversations).toBe(1);
  });
});
