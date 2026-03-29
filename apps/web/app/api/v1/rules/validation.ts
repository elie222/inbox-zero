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

const ruleActionTypeSchema = z.enum([
  ActionType.LABEL,
  ActionType.ARCHIVE,
  ActionType.MARK_READ,
  ActionType.DRAFT_EMAIL,
  ActionType.DRAFT_MESSAGING_CHANNEL,
  ActionType.REPLY,
  ActionType.FORWARD,
  ActionType.SEND_EMAIL,
  ActionType.MARK_SPAM,
  ActionType.DIGEST,
  ActionType.CALL_WEBHOOK,
  ActionType.MOVE_FOLDER,
  ActionType.NOTIFY_MESSAGING_CHANNEL,
  ActionType.NOTIFY_SENDER,
]);

const actionSchema = z
  .object({
    type: ruleActionTypeSchema,
    messagingChannelId: z.string().cuid().nullish(),
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
    addMissingActionFieldIssue({
      actionType: action.type,
      requiredActionType: ActionType.LABEL,
      fieldValue: action.fields?.label,
      message: "LABEL requires a value in fields.label.",
      path: ["fields", "label"],
      ctx,
    });
    addMissingActionFieldIssue({
      actionType: action.type,
      requiredActionType: ActionType.CALL_WEBHOOK,
      fieldValue: action.fields?.webhookUrl,
      message: "CALL_WEBHOOK requires a value in fields.webhookUrl.",
      path: ["fields", "webhookUrl"],
      ctx,
    });
    addMissingActionFieldIssue({
      actionType: action.type,
      requiredActionType: ActionType.MOVE_FOLDER,
      fieldValue: action.fields?.folderName,
      message: "MOVE_FOLDER requires a value in fields.folderName.",
      path: ["fields", "folderName"],
      ctx,
    });
    addMissingActionFieldIssue({
      actionType: action.type,
      requiredActionType: ActionType.DRAFT_MESSAGING_CHANNEL,
      fieldValue: action.messagingChannelId,
      message:
        "DRAFT_MESSAGING_CHANNEL requires a value in messagingChannelId.",
      path: ["messagingChannelId"],
      ctx,
    });
    addMissingActionFieldIssue({
      actionType: action.type,
      requiredActionType: ActionType.NOTIFY_MESSAGING_CHANNEL,
      fieldValue: action.messagingChannelId,
      message:
        "NOTIFY_MESSAGING_CHANNEL requires a value in messagingChannelId.",
      path: ["messagingChannelId"],
      ctx,
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
  type: ruleActionTypeSchema,
  messagingChannelId: z.string().cuid().nullable().optional(),
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

function addMissingActionFieldIssue({
  actionType,
  requiredActionType,
  fieldValue,
  message,
  path,
  ctx,
}: {
  actionType: ActionType;
  requiredActionType: ActionType;
  fieldValue?: string | null;
  message: string;
  path: string[];
  ctx: z.RefinementCtx;
}) {
  if (actionType !== requiredActionType) return;
  if (fieldValue?.trim()) return;

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message,
    path,
  });
}
