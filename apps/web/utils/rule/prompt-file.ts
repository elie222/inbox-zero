import {
  createPromptFromRule,
  type RuleWithRelations,
} from "@/utils/ai/rule/create-prompt-from-rule";
import { generatePromptOnUpdateRule } from "@/utils/ai/rule/generate-prompt-on-update-rule";
import prisma from "@/utils/prisma";

export async function updatePromptFileOnRuleCreated({
  emailAccountId,
  rule,
}: {
  emailAccountId: string;
  rule: RuleWithRelations;
}) {
  const prompt = createPromptFromRule(rule);
  await appendRulePrompt({ emailAccountId, rulePrompt: prompt });
}

export async function updatePromptFileOnRuleUpdated({
  emailAccountId,
  currentRule,
  updatedRule,
}: {
  emailAccountId: string;
  currentRule: RuleWithRelations;
  updatedRule: RuleWithRelations;
}) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      id: true,
      email: true,
      userId: true,
      about: true,
      rulesPrompt: true,
      user: { select: { aiProvider: true, aiModel: true, aiApiKey: true } },
    },
  });
  if (!emailAccount) return;

  const updatedPrompt = await generatePromptOnUpdateRule({
    emailAccount,
    existingPrompt: emailAccount.rulesPrompt || "",
    currentRule,
    updatedRule,
  });

  await prisma.emailAccount.update({
    where: { id: emailAccountId },
    data: { rulesPrompt: updatedPrompt },
  });
}

export async function updateRuleInstructionsAndPromptFile({
  emailAccountId,
  ruleId,
  instructions,
  currentRule,
}: {
  emailAccountId: string;
  ruleId: string;
  instructions: string;
  currentRule: RuleWithRelations | null;
}) {
  const updatedRule = await prisma.rule.update({
    where: { id: ruleId, emailAccountId },
    data: { instructions },
    include: { actions: true, categoryFilters: true, group: true },
  });

  // update prompt file
  if (currentRule) {
    await updatePromptFileOnRuleUpdated({
      emailAccountId,
      currentRule,
      updatedRule,
    });
  } else {
    await appendRulePrompt({ emailAccountId, rulePrompt: instructions });
  }
}

async function appendRulePrompt({
  emailAccountId,
  rulePrompt,
}: {
  emailAccountId: string;
  rulePrompt: string;
}) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { rulesPrompt: true },
  });

  const existingPrompt = emailAccount?.rulesPrompt ?? "";

  const updatedPrompt = `${existingPrompt}\n\n* ${rulePrompt}.`.trim();

  await prisma.emailAccount.update({
    where: { id: emailAccountId },
    data: { rulesPrompt: updatedPrompt },
  });
}
