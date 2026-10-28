import type { SystemType } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import { createEmailProvider } from "@/utils/email/provider";
import { resolveLabelNameAndId } from "@/utils/label/resolve-label";
import { assertRuleIsNotOrgManaged } from "@/utils/organizations/rules";
import {
  getRuleConfig,
  getSystemRuleActionTypes,
  isOptInSystemType,
} from "@/utils/rule/consts";
import {
  setRuleEnabled,
  upsertSystemRule,
  type RuleActionCreateData,
} from "@/utils/rule/rule";
import { getDefaultMailSplitDrafts } from "@/utils/split-inbox/default-splits";
import { setDefaultMailSplits } from "@/utils/split-inbox/default-splits.server";

export async function toggleRule({
  ruleId,
  systemType,
  enabled,
  emailAccountId,
  provider,
  logger,
}: {
  ruleId: string | undefined;
  systemType: SystemType | undefined;
  enabled: boolean;
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) {
  if (ruleId) {
    await assertRuleIsNotOrgManaged({ ruleId, emailAccountId });
    return await setRuleEnabled({ ruleId, emailAccountId, enabled });
  }

  if (!systemType) {
    throw new SafeError("System type is required");
  }

  const existingRule = await prisma.rule.findUnique({
    where: {
      emailAccountId_systemType: {
        emailAccountId,
        systemType,
      },
    },
  });

  if (existingRule) {
    const updatedRule = await setRuleEnabled({
      ruleId: existingRule.id,
      emailAccountId,
      enabled,
    });
    if (enabled) {
      await ensureDefaultMailSplitForRule({
        emailAccountId,
        systemType,
        logger,
      });
    } else if (isOptInSystemType(systemType)) {
      await ensureDefaultMailSplitForRule({
        emailAccountId,
        systemType,
        enabled: false,
        logger,
      });
    }
    return updatedRule;
  }

  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider,
    logger,
  });

  const ruleConfig = getRuleConfig(systemType);
  const actionTypes = getSystemRuleActionTypes(systemType, provider);

  const actions: RuleActionCreateData[] = [];

  for (const actionType of actionTypes) {
    if (actionType.includeFolder) {
      const folderId = await emailProvider.getOrCreateFolderIdByName(
        ruleConfig.name,
      );
      actions.push({
        type: actionType.type,
        folderId,
        folderName: ruleConfig.name,
      });
    } else if (actionType.includeLabel) {
      const labelInfo = await resolveLabelNameAndId({
        emailProvider,
        label: ruleConfig.label,
        labelId: null,
      });
      actions.push({
        type: actionType.type,
        labelId: labelInfo.labelId,
        label: labelInfo.label,
      });
    } else {
      actions.push({
        type: actionType.type,
      });
    }
  }

  const upsertedRule = await upsertSystemRule({
    name: ruleConfig.name,
    instructions: ruleConfig.instructions,
    actions,
    emailAccountId,
    systemType,
    runOnThreads: ruleConfig.runOnThreads,
    enabled,
    logger,
  });

  if (!upsertedRule) {
    logger.error("Failed to upsert system rule");
    throw new SafeError("Failed to create rule");
  }

  logger.info("Successfully upserted system rule", {
    ruleId: upsertedRule.id,
    ruleName: upsertedRule.name,
    systemType: upsertedRule.systemType,
  });

  if (enabled) {
    await ensureDefaultMailSplitForRule({
      emailAccountId,
      systemType,
      logger,
    });
  }

  return upsertedRule;
}

async function ensureDefaultMailSplitForRule({
  emailAccountId,
  systemType,
  enabled = true,
  logger,
}: {
  emailAccountId: string;
  systemType: SystemType;
  enabled?: boolean;
  logger: Logger;
}) {
  try {
    const rule = await prisma.rule.findUnique({
      where: { emailAccountId_systemType: { emailAccountId, systemType } },
      select: {
        systemType: true,
        actions: { select: { type: true, labelId: true } },
      },
    });
    if (!rule) return;
    await setDefaultMailSplits({
      emailAccountId,
      defaultSplits: getDefaultMailSplitDrafts([rule]),
      enabled,
    });
  } catch (error) {
    logger.error("Error creating default mail split", { error });
  }
}
