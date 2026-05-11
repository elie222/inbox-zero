import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  combineActionsWithAiArgs,
  filterIncompleteDraftActions,
  getParameterFieldsForAction,
  parseTemplate,
} from "./choose-args";
import { ActionType } from "@/generated/prisma/enums";
import type { Action } from "@/generated/prisma/client";
import type { DraftAttribution } from "@/utils/ai/reply/draft-attribution";

// Run with: pnpm test apps/web/utils/ai/choose-rule/choose-args.test.ts

describe("getParameterFieldsForAction", () => {
  it("creates schema for simple field", () => {
    const action = {
      label: "{{write label}}",
      subject: "",
      content: "",
      to: "",
      cc: "",
      bcc: "",
      url: "",
    };

    const result = getParameterFieldsForAction(action);

    expect(result.label).toBeDefined();
    expect(result.label?.shape).toEqual({
      var1: expect.any(z.ZodString),
    });
    const description =
      (result.label as any)?.description ||
      (result.label as any)?._def?.description;
    expect(description).toContain("{{var1: write label}}");
  });

  it("creates schema for field with multiple variables", () => {
    const action = {
      label: "",
      content: "Dear {{write greeting}},\n\n{{draft response}}\n\nBest",
      subject: "",
      to: "",
      cc: "",
      bcc: "",
      url: "",
    };

    const result = getParameterFieldsForAction(action);

    expect(result.content).toBeDefined();
    expect(result.content?.shape).toEqual({
      var1: expect.any(z.ZodString),
      var2: expect.any(z.ZodString),
    });
    const description =
      (result.content as any)?.description ||
      (result.content as any)?._def?.description;
    expect(description).toContain("{{var1: write greeting}}");
    expect(description).toContain("{{var2: draft response}}");
    expect(description).toContain("Return ONLY the value for each variable");
  });

  it("ignores fields without template variables", () => {
    const action = {
      label: "Simple label",
      subject: "",
      content: "",
      to: "",
      cc: "",
      bcc: "",
      url: "",
    };

    const result = getParameterFieldsForAction(action);

    expect(result.label).toBeUndefined();
  });

  it("handles multiple fields with template variables", () => {
    const action = {
      label: "{{write label}}",
      subject: "Re: {{write subject}}",
      content: "{{write content}}",
      to: "{{recipient}}",
      cc: "",
      bcc: "",
      url: "",
    };

    const result = getParameterFieldsForAction(action);

    expect(Object.keys(result)).toHaveLength(4);

    expect(result.label).toBeDefined();
    const labelDesc =
      (result.label as any)?.description ||
      (result.label as any)?._def?.description;
    expect(labelDesc).toContain("{{var1: write label}}");

    expect(result.subject).toBeDefined();
    const subjectDesc =
      (result.subject as any)?.description ||
      (result.subject as any)?._def?.description;
    expect(subjectDesc).toContain("Re: {{var1: write subject}}");

    expect(result.to).toBeDefined();
    const toDesc =
      (result.to as any)?.description || (result.to as any)?._def?.description;
    expect(toDesc).toContain("{{var1: recipient}}");
  });
});

describe("parseTemplate", () => {
  it("handles adjacent template variables with no gap", () => {
    const template = "start{{x}}{{y}}end";
    const result = parseTemplate(template);

    expect(result).toEqual({
      aiPrompts: ["x", "y"],
      fixedParts: ["start", "", "end"],
    });
  });

  it("handles multiple edge cases", () => {
    const cases = [
      {
        template: "{{x}}{{y}}",
        expected: {
          aiPrompts: ["x", "y"],
          fixedParts: ["", "", ""],
        },
      },
      {
        template: "{{x}}text{{y}}{{z}}",
        expected: {
          aiPrompts: ["x", "y", "z"],
          fixedParts: ["", "text", "", ""],
        },
      },
    ];

    cases.forEach(({ template, expected }) => {
      expect(parseTemplate(template)).toEqual(expected);
    });
  });

  it("handles multi-line AI prompts", () => {
    const template = `{{Determine which single label to apply based on these criteria:
1. If action is needed from Alice -> 'Action needed'
2. If a question is asked directly to Alice (excluding X emails) -> 'Answer needed'
3. If email is high priority but doesn't match above conditions -> 'High Priority'
Only return ONE of these three labels based on the most appropriate match.}}`;

    const result = parseTemplate(template);

    expect(result).toEqual({
      aiPrompts: [
        `Determine which single label to apply based on these criteria:
1. If action is needed from Alice -> 'Action needed'
2. If a question is asked directly to Alice (excluding X emails) -> 'Answer needed'
3. If email is high priority but doesn't match above conditions -> 'High Priority'
Only return ONE of these three labels based on the most appropriate match.`,
      ],
      fixedParts: ["", ""],
    });
  });

  it("handles multi-line AI prompts with surrounding text", () => {
    const template = `Label: {{Determine which single label to apply based on these criteria:
1. If action is needed from Alice -> 'Action needed'
2. If a question is asked directly to Alice (excluding X emails) -> 'Answer needed'
3. If email is high priority but doesn't match above conditions -> 'High Priority'
Only return ONE of these three labels based on the most appropriate match.}} (Auto-generated)`;

    const result = parseTemplate(template);

    expect(result).toEqual({
      aiPrompts: [
        `Determine which single label to apply based on these criteria:
1. If action is needed from Alice -> 'Action needed'
2. If a question is asked directly to Alice (excluding X emails) -> 'Answer needed'
3. If email is high priority but doesn't match above conditions -> 'High Priority'
Only return ONE of these three labels based on the most appropriate match.`,
      ],
      fixedParts: ["Label: ", " (Auto-generated)"],
    });
  });
});

describe("combineActionsWithAiArgs", () => {
  describe("DRAFT_EMAIL action with template content", () => {
    it("replaces template variables in content when AI args are provided", () => {
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

      expect(result[0].content).toBe(
        "Dear Mr. Johnson,\n\nThank you for your email. I'd be happy to help with your request.\n\nBest regards",
      );
    });

    it("stores attribution for template-generated draft content", () => {
      const actions = [
        createMockAction({
          id: "draft-template-1",
          type: ActionType.DRAFT_EMAIL,
          content: "Hello {{name}},\n\n{{reply}}",
        }),
      ];

      const aiArgs = {
        "DRAFT_EMAIL-draft-template-1": {
          content: {
            var1: "Taylor",
            var2: "Thanks for the note.",
          },
        },
      };
      const aiArgsAttribution: DraftAttribution = {
        provider: "openai",
        modelName: "gpt-5-mini",
        pipelineVersion: 1,
      };

      const result = combineActionsWithAiArgs(
        actions,
        aiArgs,
        null,
        null,
        aiArgsAttribution,
      );

      expect(result[0]).toMatchObject({
        content: "Hello Taylor,\n\nThanks for the note.",
        draftModelProvider: "openai",
        draftModelName: "gpt-5-mini",
        draftPipelineVersion: 1,
      });
    });

    it("handles DRAFT_EMAIL action without content", () => {
      const actions = [
        createMockAction({
          id: "2",
          type: ActionType.DRAFT_EMAIL,
          content: null,
        }),
      ];

      const fullDraft = "This is a complete AI-generated draft email.";

      const result = combineActionsWithAiArgs(actions, undefined, fullDraft);

      expect(result[0].content).toBe(fullDraft);
    });

    it("carries selected attachments with generated draft actions", () => {
      const actions = [
        createMockAction({
          id: "2",
          type: ActionType.DRAFT_EMAIL,
          content: null,
        }),
      ];
      const selectedAttachments = [
        {
          driveConnectionId: "drive-1",
          fileId: "file-1",
          filename: "attachment.pdf",
          mimeType: "application/pdf",
        },
      ];

      const result = combineActionsWithAiArgs(
        actions,
        undefined,
        "Generated draft",
        null,
        null,
        null,
        selectedAttachments,
      );

      expect(result[0]).toMatchObject({
        content: "Generated draft",
        selectedAttachments,
      });
    });

    it("uses one generated draft for every draft reply action", () => {
      const actions = [
        createMockAction({
          id: "3",
          type: ActionType.DRAFT_EMAIL,
          content: null,
        }),
        createMockAction({
          id: "4",
          type: ActionType.DRAFT_MESSAGING_CHANNEL,
          content: "Hello {{name}}, {{message}}",
        }),
      ];

      const aiArgs = {
        "DRAFT_MESSAGING_CHANNEL-4": {
          content: {
            var1: "Alice",
            var2: "I hope this email finds you well.",
          },
        },
      };

      const result = combineActionsWithAiArgs(
        actions,
        aiArgs,
        "Some other draft",
      );

      expect(result.map((action) => action.content)).toEqual([
        "Some other draft",
        "Some other draft",
      ]);
    });
  });

  describe("other action types with templates", () => {
    it("processes template variables in labels", () => {
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

describe("filterIncompleteDraftActions", () => {
  it("removes draft actions that have no content", () => {
    const result = filterIncompleteDraftActions([
      createMockAction({
        id: "draft-empty",
        type: ActionType.DRAFT_EMAIL,
        content: null,
      }),
      createMockAction({
        id: "label-1",
        type: ActionType.LABEL,
        label: "Important",
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe(ActionType.LABEL);
  });

  it("keeps draft actions when content exists", () => {
    const result = filterIncompleteDraftActions([
      createMockAction({
        id: "draft-filled",
        type: ActionType.DRAFT_EMAIL,
        content: "Thanks for reaching out.",
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("draft-filled");
  });
});

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
