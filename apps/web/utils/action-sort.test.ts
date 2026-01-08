import { describe, it, expect } from "vitest";
import { sortActionsByPriority } from "./action-sort";
import { ActionType } from "@/generated/prisma/enums";

describe("sortActionsByPriority", () => {
  describe("basic sorting", () => {
    it("sorts LABEL before ARCHIVE", () => {
      const actions = [
        { type: ActionType.ARCHIVE },
        { type: ActionType.LABEL },
      ];
      const sorted = sortActionsByPriority(actions);
      expect(sorted[0].type).toBe(ActionType.LABEL);
      expect(sorted[1].type).toBe(ActionType.ARCHIVE);
    });

    it("sorts ARCHIVE before REPLY", () => {
      const actions = [
        { type: ActionType.REPLY },
        { type: ActionType.ARCHIVE },
      ];
      const sorted = sortActionsByPriority(actions);
      expect(sorted[0].type).toBe(ActionType.ARCHIVE);
      expect(sorted[1].type).toBe(ActionType.REPLY);
    });

    it("sorts email actions (DRAFT_EMAIL, REPLY, SEND_EMAIL, FORWARD) together", () => {
      const actions = [
        { type: ActionType.FORWARD },
        { type: ActionType.DRAFT_EMAIL },
        { type: ActionType.SEND_EMAIL },
        { type: ActionType.REPLY },
      ];
      const sorted = sortActionsByPriority(actions);
      expect(sorted.map((a) => a.type)).toEqual([
        ActionType.DRAFT_EMAIL,
        ActionType.REPLY,
        ActionType.SEND_EMAIL,
        ActionType.FORWARD,
      ]);
    });

    it("sorts CALL_WEBHOOK last among known types", () => {
      const actions = [
        { type: ActionType.CALL_WEBHOOK },
        { type: ActionType.LABEL },
        { type: ActionType.ARCHIVE },
      ];
      const sorted = sortActionsByPriority(actions);
      expect(sorted[sorted.length - 1].type).toBe(ActionType.CALL_WEBHOOK);
    });
  });

  describe("full priority order", () => {
    it("maintains correct priority order for all action types", () => {
      const actions = [
        { type: ActionType.CALL_WEBHOOK },
        { type: ActionType.MARK_SPAM },
        { type: ActionType.DIGEST },
        { type: ActionType.FORWARD },
        { type: ActionType.SEND_EMAIL },
        { type: ActionType.REPLY },
        { type: ActionType.DRAFT_EMAIL },
        { type: ActionType.MARK_READ },
        { type: ActionType.ARCHIVE },
        { type: ActionType.MOVE_FOLDER },
        { type: ActionType.LABEL },
      ];

      const sorted = sortActionsByPriority(actions);
      expect(sorted.map((a) => a.type)).toEqual([
        ActionType.LABEL,
        ActionType.MOVE_FOLDER,
        ActionType.ARCHIVE,
        ActionType.MARK_READ,
        ActionType.DRAFT_EMAIL,
        ActionType.REPLY,
        ActionType.SEND_EMAIL,
        ActionType.FORWARD,
        ActionType.DIGEST,
        ActionType.MARK_SPAM,
        ActionType.CALL_WEBHOOK,
      ]);
    });
  });

  describe("edge cases", () => {
    it("handles empty array", () => {
      const sorted = sortActionsByPriority([]);
      expect(sorted).toEqual([]);
    });

    it("handles single action", () => {
      const actions = [{ type: ActionType.LABEL }];
      const sorted = sortActionsByPriority(actions);
      expect(sorted).toEqual(actions);
    });

    it("handles already sorted array", () => {
      const actions = [
        { type: ActionType.LABEL },
        { type: ActionType.ARCHIVE },
        { type: ActionType.REPLY },
      ];
      const sorted = sortActionsByPriority(actions);
      expect(sorted.map((a) => a.type)).toEqual([
        ActionType.LABEL,
        ActionType.ARCHIVE,
        ActionType.REPLY,
      ]);
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
    it("places unknown action types at the end with low priority", () => {
      // NOTIFY_SENDER is not in the priority list, should get priority 999
      const actions = [
        { type: ActionType.NOTIFY_SENDER },
        { type: ActionType.LABEL },
        { type: ActionType.CALL_WEBHOOK },
      ];
      const sorted = sortActionsByPriority(actions);
      // LABEL first, CALL_WEBHOOK second (last in priority list), NOTIFY_SENDER last (not in list)
      expect(sorted[0].type).toBe(ActionType.LABEL);
      expect(sorted[1].type).toBe(ActionType.CALL_WEBHOOK);
      expect(sorted[2].type).toBe(ActionType.NOTIFY_SENDER);
    });
  });
});
