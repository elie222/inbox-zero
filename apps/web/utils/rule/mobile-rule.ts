import { ConditionType } from "@/utils/config";
import type { CreateRuleBody } from "@/utils/actions/rule.validation";
import type { CreateRuleSchema } from "@/utils/ai/rule/create-rule-schema";

export function toCreateRuleBodyFromAiRule(
  rule: CreateRuleSchema,
): CreateRuleBody {
  const conditions: CreateRuleBody["conditions"] = [];

  if (rule.condition.aiInstructions) {
    conditions.push({
      type: ConditionType.AI,
      instructions: rule.condition.aiInstructions,
    });
  }

  for (const field of ["from", "to", "subject"] as const) {
    const value = rule.condition.static?.[field];
    if (!value) continue;
    conditions.push({
      type: ConditionType.STATIC,
      [field]: value,
    });
  }

  return {
    name: rule.name,
    runOnThreads: true,
    conditionalOperator: rule.condition.conditionalOperator ?? undefined,
    conditions,
    actions: rule.actions.map((action) => ({
      type: action.type,
      labelId: action.fields?.label ? { name: action.fields.label } : undefined,
      subject: action.fields?.subject
        ? { value: action.fields.subject }
        : undefined,
      content: action.fields?.content
        ? { value: action.fields.content }
        : undefined,
      to: action.fields?.to ? { value: action.fields.to } : undefined,
      cc: action.fields?.cc ? { value: action.fields.cc } : undefined,
      bcc: action.fields?.bcc ? { value: action.fields.bcc } : undefined,
      url: action.fields?.webhookUrl
        ? { value: action.fields.webhookUrl }
        : undefined,
      folderName: action.fields?.folderName
        ? { value: action.fields.folderName }
        : undefined,
      delayInMinutes: action.delayInMinutes,
    })),
  };
}
