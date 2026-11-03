import { describe, it, expect } from "vitest";
import { sortActionsByPriority } from "./action-sort";
import { ActionType } from "@/generated/prisma/enums";

describe("sortActionsByPriority", () => {
  describe("full priority order", () => {
    it("maintains correct priority order for all action types", () => {
      const actions = [
        { type: ActionType.CALL_WEBHOOK },
        { type: ActionType.NOTIFY_MESSAGING_CHANNEL },
        { type: ActionType.MARK_SPAM },
        { type: ActionType.DIGEST },
        { type: ActionType.FORWARD },
        { type: ActionType.SEND_EMAIL },
        { type: ActionType.REPLY },
        { type: ActionType.DRAFT_MESSAGING_CHANNEL },
        { type: ActionType.DRAFT_EMAIL },
        { type: ActionType.MARK_READ },
        { type: ActionType.STAR },
        { type: ActionType.ARCHIVE },
        { type: ActionType.MOVE_FOLDER },
        { type: ActionType.LABEL },
      ];

      expectSortedActionTypes(actions, [
        ActionType.LABEL,
        ActionType.MOVE_FOLDER,
        ActionType.ARCHIVE,
        ActionType.MARK_READ,
        ActionType.STAR,
        ActionType.DRAFT_EMAIL,
        ActionType.DRAFT_MESSAGING_CHANNEL,
        ActionType.REPLY,
        ActionType.SEND_EMAIL,
        ActionType.FORWARD,
        ActionType.DIGEST,
        ActionType.NOTIFY_MESSAGING_CHANNEL,
        ActionType.MARK_SPAM,
        ActionType.CALL_WEBHOOK,
      ]);
    });
  });

  describe("edge cases", () => {
    it("handles an empty array", () => {
      expect(sortActionsByPriority([])).toEqual([]);
    });

    it("preserves properties and duplicate actions", () => {
      const actions = [
        { type: ActionType.ARCHIVE, id: "1", extra: "data" },
        { type: ActionType.LABEL, id: "2", extra: "more" },
        { type: ActionType.ARCHIVE, id: "3", extra: "other" },
      ];
      const sorted = sortActionsByPriority(actions);
      expect(sorted).toEqual([actions[1], actions[0], actions[2]]);
    });

    it("does not mutate original array", () => {
      const actions = [
        { type: ActionType.ARCHIVE },
        { type: ActionType.LABEL },
      ];
      const original = [...actions];
      sortActionsByPriority(actions);
      expect(actions).toEqual(original);
    });
  });

  describe("NOTIFY_SENDER action type", () => {
    it("places NOTIFY_SENDER before CALL_WEBHOOK", () => {
      const actions = [
        { type: ActionType.CALL_WEBHOOK },
        { type: ActionType.NOTIFY_SENDER },
        { type: ActionType.LABEL },
      ];
      expectSortedActionTypes(actions, [
        ActionType.LABEL,
        ActionType.NOTIFY_SENDER,
        ActionType.CALL_WEBHOOK,
      ]);
    });
  });
});

function expectSortedActionTypes(
  actions: Array<{ type: ActionType }>,
  expectedTypes: ActionType[],
) {
  expect(sortActionsByPriority(actions).map((action) => action.type)).toEqual(
    expectedTypes,
  );
}
