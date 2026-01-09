import { describe, it, expect } from "vitest";
import {
  delayInMinutesSchema,
  createRuleBody,
  type CreateRuleBody,
} from "./rule.validation";
import { ActionType, LogicalOperator } from "@/generated/prisma/enums";
import { ConditionType } from "@/utils/config";
import { NINETY_DAYS_MINUTES } from "@/utils/date";

describe("delayInMinutesSchema", () => {
  describe("valid values", () => {
    it("accepts minimum value of 1", () => {
      const result = delayInMinutesSchema.safeParse(1);
      expect(result.success).toBe(true);
      expect(result.data).toBe(1);
    });

    it("accepts typical value of 60 minutes", () => {
      const result = delayInMinutesSchema.safeParse(60);
      expect(result.success).toBe(true);
    });

    it("accepts maximum value of 90 days in minutes", () => {
      const result = delayInMinutesSchema.safeParse(NINETY_DAYS_MINUTES);
      expect(result.success).toBe(true);
      expect(result.data).toBe(129_600); // 90 * 24 * 60
    });

    it("accepts null", () => {
      const result = delayInMinutesSchema.safeParse(null);
      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it("accepts undefined", () => {
      const result = delayInMinutesSchema.safeParse(undefined);
      expect(result.success).toBe(true);
      expect(result.data).toBeUndefined();
    });
  });

  describe("invalid values", () => {
    it("rejects 0", () => {
      const result = delayInMinutesSchema.safeParse(0);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Minimum");
      }
    });

    it("rejects negative numbers", () => {
      const result = delayInMinutesSchema.safeParse(-1);
      expect(result.success).toBe(false);
    });

    it("rejects values exceeding 90 days", () => {
      const result = delayInMinutesSchema.safeParse(NINETY_DAYS_MINUTES + 1);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Maximum");
      }
    });
  });
});

describe("createRuleBody", () => {
  const validAction = {
    type: ActionType.ARCHIVE,
  };

  const validCondition = {
    type: ConditionType.AI,
    instructions: "Archive all newsletters",
  };

  const validRule: CreateRuleBody = {
    name: "Test Rule",
    actions: [validAction],
    conditions: [validCondition],
  };

  describe("name validation", () => {
    it("accepts valid name", () => {
      const result = createRuleBody.safeParse(validRule);
      expect(result.success).toBe(true);
    });

    it("rejects empty name", () => {
      const result = createRuleBody.safeParse({
        ...validRule,
        name: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects whitespace-only name", () => {
      const result = createRuleBody.safeParse({
        ...validRule,
        name: "   ",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("actions validation", () => {
    it("requires at least one action", () => {
      const result = createRuleBody.safeParse({
        ...validRule,
        actions: [],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("at least one action");
      }
    });

    it("accepts multiple actions", () => {
      const result = createRuleBody.safeParse({
        ...validRule,
        actions: [{ type: ActionType.ARCHIVE }, { type: ActionType.MARK_READ }],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("conditions validation", () => {
    it("requires at least one condition", () => {
      const result = createRuleBody.safeParse({
        ...validRule,
        conditions: [],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          "at least one condition",
        );
      }
    });

    it("rejects duplicate AI conditions", () => {
      const result = createRuleBody.safeParse({
        ...validRule,
        conditions: [
          { type: ConditionType.AI, instructions: "First AI condition" },
          { type: ConditionType.AI, instructions: "Second AI condition" },
        ],
      });
      expect(result.success).toBe(false);
    });

    it("allows one AI condition with multiple static conditions", () => {
      const result = createRuleBody.safeParse({
        ...validRule,
        conditions: [
          { type: ConditionType.AI, instructions: "AI condition" },
          { type: ConditionType.STATIC, from: "test@example.com" },
          { type: ConditionType.STATIC, subject: "Newsletter" },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("rejects duplicate static conditions with same fields", () => {
      const result = createRuleBody.safeParse({
        ...validRule,
        conditions: [
          { type: ConditionType.STATIC, from: "test1@example.com" },
          { type: ConditionType.STATIC, from: "test2@example.com" },
        ],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("duplicate");
      }
    });

    it("allows static conditions with different fields", () => {
      const result = createRuleBody.safeParse({
        ...validRule,
        conditions: [
          { type: ConditionType.STATIC, from: "test@example.com" },
          { type: ConditionType.STATIC, subject: "Newsletter" },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("action-specific validation (superRefine)", () => {
    describe("LABEL action", () => {
      it("requires labelId value for LABEL action", () => {
        const result = createRuleBody.safeParse({
          ...validRule,
          actions: [{ type: ActionType.LABEL }],
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("label name");
        }
      });

      it("accepts labelId.value for LABEL action", () => {
        const result = createRuleBody.safeParse({
          ...validRule,
          actions: [
            {
              type: ActionType.LABEL,
              labelId: { value: "inbox/newsletters" },
            },
          ],
        });
        expect(result.success).toBe(true);
      });

      it("accepts labelId.name for LABEL action", () => {
        const result = createRuleBody.safeParse({
          ...validRule,
          actions: [
            {
              type: ActionType.LABEL,
              labelId: { name: "Newsletters" },
            },
          ],
        });
        expect(result.success).toBe(true);
      });
    });

    describe("FORWARD action", () => {
      it("requires to.value for FORWARD action", () => {
        const result = createRuleBody.safeParse({
          ...validRule,
          actions: [{ type: ActionType.FORWARD }],
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("email address");
        }
      });

      it("accepts valid to.value for FORWARD action", () => {
        const result = createRuleBody.safeParse({
          ...validRule,
          actions: [
            {
              type: ActionType.FORWARD,
              to: { value: "forward@example.com" },
            },
          ],
        });
        expect(result.success).toBe(true);
      });
    });

    describe("CALL_WEBHOOK action", () => {
      it("requires url.value for CALL_WEBHOOK action", () => {
        const result = createRuleBody.safeParse({
          ...validRule,
          actions: [{ type: ActionType.CALL_WEBHOOK }],
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("webhook URL");
        }
      });

      it("accepts valid url.value for CALL_WEBHOOK action", () => {
        const result = createRuleBody.safeParse({
          ...validRule,
          actions: [
            {
              type: ActionType.CALL_WEBHOOK,
              url: { value: "https://api.example.com/webhook" },
            },
          ],
        });
        expect(result.success).toBe(true);
      });
    });

    describe("MOVE_FOLDER action", () => {
      it("requires both folderName and folderId for MOVE_FOLDER action", () => {
        const result = createRuleBody.safeParse({
          ...validRule,
          actions: [{ type: ActionType.MOVE_FOLDER }],
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("folder");
        }
      });

      it("requires folderId when folderName is present", () => {
        const result = createRuleBody.safeParse({
          ...validRule,
          actions: [
            {
              type: ActionType.MOVE_FOLDER,
              folderName: { value: "Archive" },
            },
          ],
        });
        expect(result.success).toBe(false);
      });

      it("accepts valid folderName and folderId", () => {
        const result = createRuleBody.safeParse({
          ...validRule,
          actions: [
            {
              type: ActionType.MOVE_FOLDER,
              folderName: { value: "Archive" },
              folderId: { value: "folder123" },
            },
          ],
        });
        expect(result.success).toBe(true);
      });
    });

    describe("delayInMinutes on actions", () => {
      it("accepts action with valid delay", () => {
        const result = createRuleBody.safeParse({
          ...validRule,
          actions: [
            {
              type: ActionType.ARCHIVE,
              delayInMinutes: 60,
            },
          ],
        });
        expect(result.success).toBe(true);
      });

      it("rejects action with delay exceeding 90 days", () => {
        const result = createRuleBody.safeParse({
          ...validRule,
          actions: [
            {
              type: ActionType.ARCHIVE,
              delayInMinutes: NINETY_DAYS_MINUTES + 1,
            },
          ],
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe("optional fields", () => {
    it("accepts optional id", () => {
      const result = createRuleBody.safeParse({
        ...validRule,
        id: "rule-123",
      });
      expect(result.success).toBe(true);
    });

    it("accepts optional instructions", () => {
      const result = createRuleBody.safeParse({
        ...validRule,
        instructions: "Additional rule instructions",
      });
      expect(result.success).toBe(true);
    });

    it("accepts optional groupId", () => {
      const result = createRuleBody.safeParse({
        ...validRule,
        groupId: "group-123",
      });
      expect(result.success).toBe(true);
    });

    it("accepts optional conditionalOperator", () => {
      const result = createRuleBody.safeParse({
        ...validRule,
        conditionalOperator: LogicalOperator.OR,
      });
      expect(result.success).toBe(true);
    });

    it("conditionalOperator is undefined when not provided", () => {
      const result = createRuleBody.safeParse(validRule);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.conditionalOperator).toBeUndefined();
      }
    });
  });
});
