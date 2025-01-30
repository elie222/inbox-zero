import {
  createPromptFromRule,
  type RuleWithRelations,
} from "@/utils/ai/rule/create-prompt-from-rule";
import { generatePromptOnUpdateRule } from "@/utils/ai/rule/generate-prompt-on-update-rule";
import prisma from "@/utils/prisma";

export async function updatePromptFileOnRuleCreated(
  userId: string,
  rule: RuleWithRelations,
) {
  const prompt = createPromptFromRule(rule);
  await appendRulePrompt(userId, prompt);
}

export async function updatePromptFileOnRuleUpdated(
  userId: string,
  currentRule: RuleWithRelations,
  updatedRule: RuleWithRelations,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      aiModel: true,
      aiProvider: true,
      aiApiKey: true,
      rulesPrompt: true,
    },
  });
  if (!user) return;

  const updatedPrompt = await generatePromptOnUpdateRule({
    user,
    existingPrompt: user.rulesPrompt || "",
    currentRule,
    updatedRule,
  });

  await prisma.user.update({
    where: { id: userId },
    data: { rulesPrompt: updatedPrompt },
  });
}

export async function updateRuleInstructionsAndPromptFile({
  userId,
  ruleId,
  instructions,
  currentRule,
}: {
  userId: string;
  ruleId: string;
  instructions: string;
  currentRule: RuleWithRelations | null;
}) {
  const updatedRule = await prisma.rule.update({
    where: { id: ruleId, userId },
    data: { instructions },
    include: { actions: true, categoryFilters: true, group: true },
  });

  // update prompt file
  if (currentRule) {
    await updatePromptFileOnRuleUpdated(userId, currentRule, updatedRule);
  } else {
    await appendRulePrompt(userId, instructions);
  }
}

async function appendRulePrompt(userId: string, rulePrompt: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { rulesPrompt: true },
  });

  if (!user?.rulesPrompt) return;

  const updatedPrompt = `${user.rulesPrompt || ""}\n\n* ${rulePrompt}.`.trim();

  await prisma.user.update({
    where: { id: userId },
    data: { rulesPrompt: updatedPrompt },
  });
}
