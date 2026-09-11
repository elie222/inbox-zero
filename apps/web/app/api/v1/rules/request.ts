import type { RuleRequestBody } from "@/app/api/v1/rules/validation";
import type { CreateOrUpdateRuleSchema } from "@/utils/ai/rule/create-rule-schema";
import { toCreateOrUpdateRuleCondition } from "@/utils/rule/create-rule-condition";

type RuleWriteInput = {
  name: string;
  condition: CreateOrUpdateRuleSchema["condition"];
  actions: CreateOrUpdateRuleSchema["actions"];
  runOnThreads: boolean;
};

export function toRuleWriteInput(body: RuleRequestBody): RuleWriteInput {
  return {
    name: body.name,
    condition: toCreateOrUpdateRuleCondition({
      conditionalOperator: body.condition.conditionalOperator ?? null,
      aiInstructions: body.condition.aiInstructions,
      static: body.condition.static,
    }),
    actions: body.actions.map((action) => ({
      type: action.type,
      messagingChannelId: action.messagingChannelId ?? null,
      fields: action.fields
        ? {
            label: action.fields.label ?? null,
            to: action.fields.to ?? null,
            cc: action.fields.cc ?? null,
            bcc: action.fields.bcc ?? null,
            subject: action.fields.subject ?? null,
            content: action.fields.content ?? null,
            webhookUrl: action.fields.webhookUrl ?? null,
            folderName: action.fields.folderName ?? null,
          }
        : null,
      delayInMinutes: action.delayInMinutes ?? null,
    })),
    runOnThreads: body.runOnThreads ?? true,
  };
}
