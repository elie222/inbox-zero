import { describe, expect, it } from "vitest";
import {
  classifyCorrection,
  completeSnapshot,
  observeChanges,
  type Observation,
  type ObservationState,
} from "./changes";

const message: Observation = {
  key: "stable-message",
  messageId: "provider-id",
  threadId: "thread-id",
  sender: "orders@example.com",
  subject: "Order confirmed",
  recipients: ["owner@example.com"],
  targets: ["Purchases"],
  observedAt: 1000,
};
const change = (targets: string[]) => ({
  before: message,
  after: { ...message, targets, observedAt: 2000 },
  since: 2000,
});

describe("mail corrections", () => {
  it("baselines existing messages without teaching from them", () => {
    const state: ObservationState = { observed: {}, pending: {} };
    expect(observeChanges(state, [message], 1000, 100)).toEqual([]);
    expect(state.pending).toEqual({});
  });
  it("waits for a move to settle and coalesces its intermediate copies", () => {
    const state: ObservationState = {
      observed: { [message.key]: message },
      pending: {},
    };
    expect(
      observeChanges(
        state,
        [{ ...message, targets: ["Purchases", "Finance"] }],
        2000,
        100,
      ),
    ).toEqual([]);
    expect(
      observeChanges(state, [{ ...message, targets: ["Finance"] }], 2100, 100),
    ).toEqual([]);
    const ready = observeChanges(
      state,
      [{ ...message, targets: ["Finance"] }],
      2200,
      100,
    );
    expect(ready).toHaveLength(1);
    expect(ready[0].before.targets).toEqual(["Purchases"]);
    expect(ready[0].after.targets).toEqual(["Finance"]);
  });
  it("settles a disappearance on successive full snapshots without teaching deletion", () => {
    const state: ObservationState = {
      observed: { [message.key]: message },
      pending: {},
    };
    observeChanges(state, completeSnapshot(state, [], 2000), 2000, 100);
    const ready = observeChanges(
      state,
      completeSnapshot(state, [], 2200),
      2200,
      100,
    );
    expect(ready).toHaveLength(1);
    expect(classifyCorrection(ready[0])).toBeNull();
  });
  it("cancels a correction when a move is undone before settling", () => {
    const state: ObservationState = {
      observed: { [message.key]: message },
      pending: {},
    };
    observeChanges(state, [{ ...message, targets: ["Finance"] }], 2000, 100);
    expect(observeChanges(state, [message], 2050, 100)).toEqual([]);
    expect(state.pending).toEqual({});
  });
  it("records positive and negative category examples without a sender-wide rule", () => {
    expect(classifyCorrection(change(["Finance"]))).toEqual({
      added: ["Finance"],
      removed: ["Purchases"],
    });
  });
  it("recognizes restoring Inbox while a Gmail category label remains", () => {
    expect(classifyCorrection(change(["Purchases", "@inbox"]))).toEqual({
      added: ["@inbox"],
      removed: ["Purchases"],
    });
  });
  it("recognizes Junk rescues as both legitimate mail and a category correction", () => {
    expect(
      classifyCorrection({
        ...change(["Personal"]),
        before: { ...message, targets: ["@junk"] },
      }),
    ).toEqual({ added: ["Personal"], removed: ["@junk"] });
  });
  it("learns not-junk when a message is rescued into Archive", () => {
    expect(
      classifyCorrection({
        ...change(["@archive"]),
        before: { ...message, targets: ["@junk"] },
      }),
    ).toEqual({ added: [], removed: ["@junk"] });
  });
  it.each([
    { targets: ["@trash"] },
    { targets: [] },
  ])("does not learn from deletion or moving to Trash: $targets", ({
    targets,
  }) => {
    expect(classifyCorrection(change(targets))).toBeNull();
    expect(
      classifyCorrection({
        ...change(["Personal"]),
        before: { ...message, targets },
      }),
    ).toBeNull();
  });
  it("does not mistake archiving or read-state changes for a correction", () => {
    expect(
      classifyCorrection({
        ...change(["Purchases"]),
        before: { ...message, targets: ["Purchases", "@inbox"] },
      }),
    ).toBeNull();
    expect(classifyCorrection(change(["Purchases"]))).toBeNull();
  });
  it("defers ambiguous copies instead of guessing a category", () => {
    expect(classifyCorrection(change(["Purchases", "Finance"]))).toBeNull();
    expect(
      classifyCorrection({
        ...change(["Finance"]),
        before: { ...message, targets: ["Purchases", "Finance", "@ambiguous"] },
      }),
    ).toBeNull();
  });
});
