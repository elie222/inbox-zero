import prisma from "@/utils/prisma";
import type { RuleWithRelations } from "@/utils/ai/rule/create-prompt-from-rule";

export type RuleHistoryTrigger =
  | "ai_update" // AI updates existing rule from prompt changes
  | "manual_update" // User manually edits existing rule
  | "ai_creation" // AI creates rule from parsing prompts
  | "manual_creation" // User manually creates new rule
  | "system_creation" // System automatically creates rule (e.g., reply tracker)
  | "system_update"; // System automatically updates rule

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
    label: action.label,
    subject: action.subject,
    content: action.content,
    to: action.to,
    cc: action.cc,
    bcc: action.bcc,
    url: action.url,
  }));

  // Serialize category filters to JSON
  const categoryFiltersSnapshot = rule.categoryFilters?.map((category) => ({
    id: category.id,
    name: category.name,
    description: category.description,
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
      categoryFilterType: rule.categoryFilterType,
      systemType: rule.systemType,
      promptText: rule.promptText,
      actions: actionsSnapshot,
      categoryFilters: categoryFiltersSnapshot,
      triggerType,
      // Note: this is unique and can fail in race conditions. Not a big deal for now.
      version: nextVersion,
    },
  });
}
