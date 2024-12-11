import { z } from "zod";
import { CategoryFilterType, GroupItemType } from "@prisma/client";
import { ActionType, RuleType } from "@prisma/client";

// groups
export const createGroupBody = z.object({
  name: z.string(),
  prompt: z.string().optional(),
});
export type CreateGroupBody = z.infer<typeof createGroupBody>;

export const addGroupItemBody = z.object({
  groupId: z.string(),
  type: z.enum([GroupItemType.FROM, GroupItemType.SUBJECT]),
  value: z.string(),
});
export type AddGroupItemBody = z.infer<typeof addGroupItemBody>;

export const updateGroupPromptBody = z.object({
  groupId: z.string(),
  prompt: z.string().nullable(),
});
export type UpdateGroupPromptBody = z.infer<typeof updateGroupPromptBody>;

// rules
export const zodActionType = z.enum([
  ActionType.ARCHIVE,
  ActionType.DRAFT_EMAIL,
  ActionType.FORWARD,
  ActionType.LABEL,
  ActionType.MARK_SPAM,
  ActionType.REPLY,
  ActionType.SEND_EMAIL,
]);

const zodField = z
  .object({
    value: z.string().nullish(),
    ai: z.boolean().nullish(),
  })
  .nullish();

const zodAction = z.object({
  type: zodActionType,
  label: zodField,
  subject: zodField,
  content: zodField,
  to: zodField,
  cc: zodField,
  bcc: zodField,
});

export const zodRuleType = z.enum([
  RuleType.AI,
  RuleType.STATIC,
  RuleType.GROUP,
]);

export const createRuleBody = z.object({
  id: z.string().optional(),
  name: z.string(),
  instructions: z.string().nullish(),
  automate: z.boolean().nullish(),
  runOnThreads: z.boolean().nullish(),
  actions: z.array(zodAction),
  type: zodRuleType,
  // static conditions
  from: z.string().nullish(),
  to: z.string().nullish(),
  subject: z.string().nullish(),
  // body: z.string().nullish(), // not in use atm
  // group
  groupId: z.string().nullish(),
  categoryFilterType: z
    .enum([CategoryFilterType.INCLUDE, CategoryFilterType.EXCLUDE])
    .nullish(),
  categoryFilters: z.array(z.string()).nullish(),
});
export type CreateRuleBody = z.infer<typeof createRuleBody>;

export const updateRuleBody = createRuleBody.extend({
  id: z.string(),
  actions: z.array(zodAction.extend({ id: z.string().optional() })),
});
export type UpdateRuleBody = z.infer<typeof updateRuleBody>;

export const saveRulesPromptBody = z.object({ rulesPrompt: z.string().trim() });
export type SaveRulesPromptBody = z.infer<typeof saveRulesPromptBody>;

export const rulesExamplesBody = z.object({
  rulesPrompt: z.string(),
});
export type RulesExamplesBody = z.infer<typeof rulesExamplesBody>;

export const testAiBody = z.object({
  messageId: z.string(),
  threadId: z.string(),
});
export type TestAiBody = z.infer<typeof testAiBody>;

export const reportAiMistakeBody = z
  .object({
    email: z.object({
      from: z.string(),
      subject: z.string(),
      snippet: z.string(),
      textHtml: z.string().nullish(),
      textPlain: z.string().nullish(),
    }),
    correctRuleId: z.string().nullish(),
    incorrectRuleId: z.string().nullish(),
    explanation: z.string().nullish(),
  })
  .refine(
    (data) => data.correctRuleId != null || data.incorrectRuleId != null,
    {
      message: "Either correctRuleId or incorrectRuleId must be provided",
      path: ["correctRuleId"], // This will show the error on the correctRuleId field
    },
  );
export type ReportAiMistakeBody = z.infer<typeof reportAiMistakeBody>;

// categories
export const createCategoryBody = z.object({
  id: z.string().nullish(),
  name: z.string().max(30),
  description: z.string().max(300).nullish(),
});
export type CreateCategoryBody = z.infer<typeof createCategoryBody>;

// api key
export const createApiKeyBody = z.object({ name: z.string().nullish() });
export type CreateApiKeyBody = z.infer<typeof createApiKeyBody>;

export const deactivateApiKeyBody = z.object({ id: z.string() });
export type DeactivateApiKeyBody = z.infer<typeof deactivateApiKeyBody>;
