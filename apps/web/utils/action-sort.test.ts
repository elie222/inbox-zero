import { describe, it, expect } from "vitest";
import { sortActionsByPriority } from "./action-sort";
import { ActionType } from "@/generated/prisma/enums";

describe("sortActionsByPriority", () => {
  describe("basic sorting", () => {
    it.each([
      {
        name: "LABEL before ARCHIVE",
        actions: [{ type: ActionType.ARCHIVE }, { type: ActionType.LABEL }],
        expected: [ActionType.LABEL, ActionType.ARCHIVE],
      },
      {
        name: "ARCHIVE before REPLY",
        actions: [{ type: ActionType.REPLY }, { type: ActionType.ARCHIVE }],
        expected: [ActionType.ARCHIVE, ActionType.REPLY],
      },
      {
        name: "draft and email actions together",
        actions: [
          { type: ActionType.FORWARD },
          { type: ActionType.DRAFT_MESSAGING_CHANNEL },
          { type: ActionType.DRAFT_EMAIL },
          { type: ActionType.SEND_EMAIL },
          { type: ActionType.REPLY },
        ],
        expected: [
          ActionType.DRAFT_EMAIL,
          ActionType.DRAFT_MESSAGING_CHANNEL,
          ActionType.REPLY,
          ActionType.SEND_EMAIL,
          ActionType.FORWARD,
        ],
      },
    ])("sorts $name", ({ actions, expected }) => {
      expectSortedActionTypes(actions, expected);
    });

    it("sorts CALL_WEBHOOK last among known types", () => {
      const actions = [
        { type: ActionType.CALL_WEBHOOK },
        { type: ActionType.LABEL },
        { type: ActionType.ARCHIVE },
      ];
      expectSortedActionTypes(actions, [
        ActionType.LABEL,
        ActionType.ARCHIVE,
        ActionType.CALL_WEBHOOK,
      ]);
    });
  });

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
    it.each([
      {
        name: "empty array",
        actions: [],
        expected: [],
      },
      {
        name: "single action",
        actions: [{ type: ActionType.LABEL }],
        expected: [ActionType.LABEL],
      },
      {
        name: "already sorted array",
        actions: [
          { type: ActionType.LABEL },
          { type: ActionType.ARCHIVE },
          { type: ActionType.REPLY },
        ],
        expected: [ActionType.LABEL, ActionType.ARCHIVE, ActionType.REPLY],
      },
    ])("handles $name", ({ actions, expected }) => {
      expectSortedActionTypes(actions, expected);
    });

    it("handles duplicate action types", () => {
      const actions = [
        { type: ActionType.ARCHIVE, id: "1" },
        { type: ActionType.LABEL, id: "2" },
        { type: ActionType.ARCHIVE, id: "3" },
      ];
      const sorted = sortActionsByPriority(actions);
      expect(sorted[0].type).toBe(ActionType.LABEL);
      // Both archives should come after label
      expect(sorted[1].type).toBe(ActionType.ARCHIVE);
      expect(sorted[2].type).toBe(ActionType.ARCHIVE);
    });

    it("preserves additional properties on action objects", () => {
      const actions = [
        { type: ActionType.ARCHIVE, id: "1", extra: "data" },
        { type: ActionType.LABEL, id: "2", extra: "more" },
      ];
      const sorted = sortActionsByPriority(actions);
      expect(sorted[0]).toEqual({
        type: ActionType.LABEL,
        id: "2",
        extra: "more",
      });
      expect(sorted[1]).toEqual({
        type: ActionType.ARCHIVE,
        id: "1",
        extra: "data",
      });
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

  describe("NOTIFY_MESSAGING_CHANNEL action type", () => {
    it("places NOTIFY_MESSAGING_CHANNEL after DIGEST and before MARK_SPAM", () => {
      const actions = [
        { type: ActionType.MARK_SPAM },
        { type: ActionType.DIGEST },
        { type: ActionType.NOTIFY_MESSAGING_CHANNEL },
      ];

      expectSortedActionTypes(actions, [
        ActionType.DIGEST,
        ActionType.NOTIFY_MESSAGING_CHANNEL,
        ActionType.MARK_SPAM,
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
