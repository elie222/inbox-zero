import { describe, it, expect, vi } from "vitest";
import { combineActionsWithAiArgs } from "./choose-args";
import { ActionType, type Action } from "@/generated/prisma";

vi.mock("server-only", () => ({}));

// Helper function to create a mock Action object
function createMockAction(overrides: Partial<Action> = {}): Action {
  return {
    id: "test-action-id",
    createdAt: new Date(),
    updatedAt: new Date(),
    type: ActionType.DRAFT_EMAIL,
    ruleId: "test-rule-id",
    to: null,
    subject: null,
    label: null,
    content: null,
    cc: null,
    bcc: null,
    url: null,
    folderName: null,
    folderId: null,
    delayInMinutes: null,
    ...overrides,
  };
}

describe("combineActionsWithAiArgs", () => {
  describe("DRAFT_EMAIL action with template content", () => {
    it("should replace template variables in content when AI args are provided", () => {
      // This test ensures template variables are replaced with AI-generated content
      const actions = [
        createMockAction({
          id: "1",
          type: ActionType.DRAFT_EMAIL,
          content: "Dear {{greeting}},\n\n{{draft response}}\n\nBest regards",
        }),
      ];

      const aiArgs = {
        "DRAFT_EMAIL-1": {
          content: {
            var1: "Mr. Johnson",
            var2: "Thank you for your email. I'd be happy to help with your request.",
          },
        },
      };

      const result = combineActionsWithAiArgs(actions, aiArgs, null);

      // Verify that template variables are properly replaced
      expect(result[0].content).toBe(
        "Dear Mr. Johnson,\n\nThank you for your email. I'd be happy to help with your request.\n\nBest regards",
      );
    });

    it("should handle DRAFT_EMAIL action without content (full draft generation)", () => {
      // This test shows the working case where no template exists
      const actions = [
        createMockAction({
          id: "2",
          type: ActionType.DRAFT_EMAIL,
          content: null,
        }),
      ];

      const fullDraft = "This is a complete AI-generated draft email.";

      const result = combineActionsWithAiArgs(actions, undefined, fullDraft);

      // This case works correctly - the full draft is added
      expect(result[0].content).toBe(fullDraft);
    });

    it("should not skip content field processing when draft exists but action has template", () => {
      // This test ensures that templates with variables are processed even when a draft exists
      const actions = [
        createMockAction({
          id: "3",
          type: ActionType.DRAFT_EMAIL,
          content: "Hello {{name}}, {{message}}",
        }),
      ];

      const aiArgs = {
        "DRAFT_EMAIL-3": {
          content: {
            var1: "Alice",
            var2: "I hope this email finds you well.",
          },
        },
      };

      // Even if draft is provided, template processing should still happen
      // This draft represents content from another action, not this one
      const draftFromAnotherAction = "Some other draft";

      const result = combineActionsWithAiArgs(
        actions,
        aiArgs,
        draftFromAnotherAction,
      );

      // Verify that template variables are processed correctly
      expect(result[0].content).toBe(
        "Hello Alice, I hope this email finds you well.",
      );
    });
  });

  describe("Other action types with templates", () => {
    it("should process template variables in labels", () => {
      const actions = [
        createMockAction({
          id: "4",
          type: ActionType.LABEL,
          content: null,
          label: "Priority: {{level}}",
        }),
      ];

      const aiArgs = {
        "LABEL-4": {
          label: {
            var1: "High",
          },
        },
      };

      const result = combineActionsWithAiArgs(actions, aiArgs, null);

      expect(result[0].label).toBe("Priority: High");
    });
  });
});
