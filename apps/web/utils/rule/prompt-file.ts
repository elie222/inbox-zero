import {
  createPromptFromRule,
  type RuleWithRelations,
} from "@/utils/ai/rule/create-prompt-from-rule";
import { generatePromptOnUpdateRule } from "@/utils/ai/rule/generate-prompt-on-update-rule";
import prisma from "@/utils/prisma";

export async function updatePromptFileOnRuleCreated({
  email,
  rule,
}: {
  email: string;
  rule: RuleWithRelations;
}) {
  const prompt = createPromptFromRule(rule);
  await appendRulePrompt({ email, rulePrompt: prompt });
}

export async function updatePromptFileOnRuleUpdated({
  email,
  currentRule,
  updatedRule,
}: {
  email: string;
  currentRule: RuleWithRelations;
  updatedRule: RuleWithRelations;
}) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { email },
    select: {
      email: true,
      userId: true,
      about: true,
      aiModel: true,
      aiProvider: true,
      aiApiKey: true,
      rulesPrompt: true,
    },
  });
  if (!emailAccount) return;

  const updatedPrompt = await generatePromptOnUpdateRule({
    user: emailAccount,
    existingPrompt: emailAccount.rulesPrompt || "",
    currentRule,
    updatedRule,
  });

  await prisma.emailAccount.update({
    where: { email },
    data: { rulesPrompt: updatedPrompt },
  });
}

export async function updateRuleInstructionsAndPromptFile({
  email,
  ruleId,
  instructions,
  currentRule,
}: {
  email: string;
  ruleId: string;
  instructions: string;
  currentRule: RuleWithRelations | null;
}) {
  const updatedRule = await prisma.rule.update({
    where: { id: ruleId, emailAccountId: email },
    data: { instructions },
    include: { actions: true, categoryFilters: true, group: true },
  });

  // update prompt file
  if (currentRule) {
    await updatePromptFileOnRuleUpdated({
      email,
      currentRule,
      updatedRule,
    });
  } else {
    await appendRulePrompt({ email, rulePrompt: instructions });
  }
}

async function appendRulePrompt({
  email,
  rulePrompt,
}: {
  email: string;
  rulePrompt: string;
}) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { email },
    select: { rulesPrompt: true },
  });

  const existingPrompt = emailAccount?.rulesPrompt ?? "";

  const updatedPrompt = `${existingPrompt}\n\n* ${rulePrompt}.`.trim();

  await prisma.emailAccount.update({
    where: { email },
    data: { rulesPrompt: updatedPrompt },
  });
}
