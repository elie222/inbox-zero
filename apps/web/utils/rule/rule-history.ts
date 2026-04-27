import prisma from "@/utils/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { RuleWithRelations } from "@/utils/rule/types";

export type RuleHistoryTrigger =
  | "created"
  | "updated"
  | "actions_updated"
  | "conditions_updated"
  | "instructions_updated"
  | "enabled_updated"
  | "run_on_threads_updated";

export const ruleHistoryRuleInclude = {
  actions: true,
  group: true,
} satisfies Prisma.RuleInclude;

/**
 * Creates a complete snapshot of a rule in the RuleHistory table
 */
export async function createRuleHistory({
  rule,
  triggerType,
}: {
  rule: RuleWithRelations;
  triggerType: RuleHistoryTrigger;
}) {
  // Get the current version number for this rule
  const lastHistory = await prisma.ruleHistory.findFirst({
    where: { ruleId: rule.id },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const nextVersion = (lastHistory?.version ?? 0) + 1;

  // Serialize actions to JSON
  const actionsSnapshot = rule.actions.map((action) => ({
    id: action.id,
    type: action.type,
    messagingChannelId: action.messagingChannelId,
    messagingChannelEmailAccountId: action.messagingChannelEmailAccountId,
    label: action.label,
    labelId: action.labelId,
    subject: action.subject,
    content: action.content,
    to: action.to,
    cc: action.cc,
    bcc: action.bcc,
    url: action.url,
    folderName: action.folderName,
    folderId: action.folderId,
    delayInMinutes: action.delayInMinutes,
    staticAttachments: action.staticAttachments,
  }));

  return prisma.ruleHistory.create({
    data: {
      ruleId: rule.id,
      name: rule.name,
      instructions: rule.instructions,
      enabled: rule.enabled,
      automate: rule.automate,
      runOnThreads: rule.runOnThreads,
      conditionalOperator: rule.conditionalOperator,
      from: rule.from,
      to: rule.to,
      subject: rule.subject,
      body: rule.body,
      systemType: rule.systemType,
      promptText: rule.promptText,
      actions: actionsSnapshot,
      triggerType,
      // Note: this is unique and can fail in race conditions. Not a big deal for now.
      version: nextVersion,
    },
  });
}
