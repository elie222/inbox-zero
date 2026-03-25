import type { Prisma } from "@/generated/prisma/client";

export const apiRuleSelect = {
  id: true,
  name: true,
  enabled: true,
  runOnThreads: true,
  createdAt: true,
  updatedAt: true,
  instructions: true,
  conditionalOperator: true,
  from: true,
  to: true,
  subject: true,
  actions: {
    select: {
      type: true,
      messagingChannelId: true,
      label: true,
      to: true,
      cc: true,
      bcc: true,
      subject: true,
      content: true,
      url: true,
      folderName: true,
      delayInMinutes: true,
    },
  },
} satisfies Prisma.RuleSelect;

type ApiRuleRecord = Prisma.RuleGetPayload<{ select: typeof apiRuleSelect }>;

export function serializeRule(rule: ApiRuleRecord) {
  return {
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    runOnThreads: rule.runOnThreads,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
    condition: {
      conditionalOperator: rule.conditionalOperator ?? null,
      aiInstructions: rule.instructions ?? null,
      static: {
        from: rule.from ?? null,
        to: rule.to ?? null,
        subject: rule.subject ?? null,
      },
    },
    actions: rule.actions.map((action) => ({
      type: action.type,
      messagingChannelId: action.messagingChannelId ?? null,
      fields: {
        label: action.label ?? null,
        to: action.to ?? null,
        cc: action.cc ?? null,
        bcc: action.bcc ?? null,
        subject: action.subject ?? null,
        content: action.content ?? null,
        webhookUrl: action.url ?? null,
        folderName: action.folderName ?? null,
      },
      delayInMinutes: action.delayInMinutes ?? null,
    })),
  };
}
