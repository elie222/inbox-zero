import { z } from "zod";
import { ActionType, LogicalOperator } from "@/generated/prisma/enums";
import { NINETY_DAYS_MINUTES } from "@/utils/date";
import { addMissingRecipientIssue } from "@/utils/rule/recipient-validation";

const conditionSchema = z
  .object({
    conditionalOperator: z
      .enum([LogicalOperator.AND, LogicalOperator.OR])
      .nullish(),
    aiInstructions: z.string().nullish(),
    static: z
      .object({
        from: z.string().nullish(),
        to: z.string().nullish(),
        subject: z.string().nullish(),
      })
      .nullish(),
  })
  .refine(
    (condition) =>
      !!condition.aiInstructions?.trim() ||
      !!condition.static?.from?.trim() ||
      !!condition.static?.to?.trim() ||
      !!condition.static?.subject?.trim(),
    {
      message: "A rule must include at least one condition",
    },
  );

const actionSchema = z
  .object({
    type: z.enum([
      ActionType.LABEL,
      ActionType.ARCHIVE,
      ActionType.MARK_READ,
      ActionType.DRAFT_EMAIL,
      ActionType.REPLY,
      ActionType.FORWARD,
      ActionType.SEND_EMAIL,
      ActionType.MARK_SPAM,
      ActionType.DIGEST,
      ActionType.CALL_WEBHOOK,
      ActionType.MOVE_FOLDER,
      ActionType.NOTIFY_SENDER,
    ]),
    fields: z
      .object({
        label: z.string().nullish(),
        to: z.string().nullish(),
        cc: z.string().nullish(),
        bcc: z.string().nullish(),
        subject: z.string().nullish(),
        content: z.string().nullish(),
        webhookUrl: z.string().nullish(),
        folderName: z.string().nullish(),
      })
      .nullish(),
    delayInMinutes: z
      .number()
      .min(1, "Minimum supported delay is 1 minute")
      .max(NINETY_DAYS_MINUTES, "Maximum supported delay is 90 days")
      .nullish(),
  })
  .superRefine((action, ctx) => {
    addMissingRecipientIssue({
      actionType: action.type,
      recipient: action.fields?.to,
      ctx,
      path: ["fields", "to"],
      sendEmailMessage:
        "SEND_EMAIL requires a recipient in fields.to. Use REPLY for auto-responses.",
      forwardMessage: "FORWARD requires a recipient in fields.to.",
    });
  });

export const rulePathParamsSchema = z.object({
  id: z.string(),
});

export const ruleRequestBodySchema = z.object({
  name: z.string().trim().min(1),
  runOnThreads: z.boolean().optional().default(true),
  condition: conditionSchema,
  actions: z.array(actionSchema).min(1),
});

const ruleActionResponseSchema = z.object({
  type: z.string(),
  fields: z.object({
    label: z.string().nullable(),
    to: z.string().nullable(),
    cc: z.string().nullable(),
    bcc: z.string().nullable(),
    subject: z.string().nullable(),
    content: z.string().nullable(),
    webhookUrl: z.string().nullable(),
    folderName: z.string().nullable(),
  }),
  delayInMinutes: z.number().nullable(),
});

export const ruleResponseSchema = z.object({
  rule: z.object({
    id: z.string(),
    name: z.string(),
    enabled: z.boolean(),
    runOnThreads: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    condition: z.object({
      conditionalOperator: z
        .enum([LogicalOperator.AND, LogicalOperator.OR])
        .nullable(),
      aiInstructions: z.string().nullable(),
      static: z.object({
        from: z.string().nullable(),
        to: z.string().nullable(),
        subject: z.string().nullable(),
      }),
    }),
    actions: z.array(ruleActionResponseSchema),
  }),
});

export const rulesResponseSchema = z.object({
  rules: z.array(ruleResponseSchema.shape.rule),
});

export type RuleRequestBody = z.infer<typeof ruleRequestBodySchema>;
