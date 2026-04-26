import type { RuleRequestBody } from "@/app/api/v1/rules/validation";

export function toRuleWriteInput(body: RuleRequestBody) {
  return {
    name: body.name,
    condition: {
      conditionalOperator: body.condition.conditionalOperator ?? null,
      aiInstructions: body.condition.aiInstructions ?? null,
      static: {
        from: body.condition.static?.from ?? null,
        to: body.condition.static?.to ?? null,
        subject: body.condition.static?.subject ?? null,
      },
    },
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
