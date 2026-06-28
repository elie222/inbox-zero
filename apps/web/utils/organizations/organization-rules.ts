import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import type { Prisma } from "@/generated/prisma/client";
import {
  createRuleWithResolvedActions,
  replaceRuleWithResolvedActions,
  type RuleActionCreateData,
} from "@/utils/rule/rule";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { SafeError } from "@/utils/error";

const organizationRuleInclude = {
  actions: true,
  teams: { select: { id: true } },
} satisfies Prisma.OrganizationRuleInclude;

type OrganizationRuleWithRelations = Prisma.OrganizationRuleGetPayload<{
  include: typeof organizationRuleInclude;
}>;

export type OrganizationRuleSyncResult = {
  createdCount: number;
  updatedCount: number;
  removedCount: number;
  skipped: { email: string; reason: string }[];
};

export function organizationRuleAppliesToMember({
  ruleTeamIds,
  memberTeamId,
}: {
  ruleTeamIds: string[];
  memberTeamId: string | null;
}) {
  if (ruleTeamIds.length === 0) return true;
  return !!memberTeamId && ruleTeamIds.includes(memberTeamId);
}

/**
 * Provisions an organization rule into every targeted member's email account
 * as a managed Rule row, updates already-provisioned copies, and removes
 * copies from members the rule no longer targets.
 */
export async function syncOrganizationRule({
  organizationRuleId,
  logger,
}: {
  organizationRuleId: string;
  logger: Logger;
}): Promise<OrganizationRuleSyncResult> {
  const organizationRule = await prisma.organizationRule.findUnique({
    where: { id: organizationRuleId },
    include: organizationRuleInclude,
  });

  if (!organizationRule) {
    throw new SafeError("Organization rule not found");
  }

  const members = await prisma.member.findMany({
    where: { organizationId: organizationRule.organizationId },
    select: {
      teamId: true,
      emailAccount: { select: { id: true, email: true } },
    },
  });

  const ruleTeamIds = organizationRule.teams.map((team) => team.id);
  const targets = members.filter((member) =>
    organizationRuleAppliesToMember({
      ruleTeamIds,
      memberTeamId: member.teamId,
    }),
  );

  const existingManagedRules = await prisma.rule.findMany({
    where: { organizationRuleId },
    select: { id: true, emailAccountId: true },
  });
  const managedRuleByAccountId = new Map(
    existingManagedRules.map((rule) => [rule.emailAccountId, rule.id]),
  );

  const result: OrganizationRuleSyncResult = {
    createdCount: 0,
    updatedCount: 0,
    removedCount: 0,
    skipped: [],
  };

  const targetAccountIds = new Set(
    targets.map((member) => member.emailAccount.id),
  );
  const ruleIdsToRemove = existingManagedRules
    .filter((rule) => !targetAccountIds.has(rule.emailAccountId))
    .map((rule) => rule.id);

  if (ruleIdsToRemove.length > 0) {
    const { count } = await prisma.rule.deleteMany({
      where: { id: { in: ruleIdsToRemove }, organizationRuleId },
    });
    result.removedCount = count;
  }

  for (const member of targets) {
    const outcome = await applyOrganizationRuleToAccount({
      organizationRule,
      emailAccountId: member.emailAccount.id,
      existingRuleId: managedRuleByAccountId.get(member.emailAccount.id),
      logger,
    });

    if (outcome.status === "created") result.createdCount++;
    else if (outcome.status === "updated") result.updatedCount++;
    else
      result.skipped.push({
        email: member.emailAccount.email,
        reason: outcome.reason,
      });
  }

  logger.info("Synced organization rule to members", {
    organizationRuleId,
    organizationId: organizationRule.organizationId,
    ...result,
    skipped: result.skipped.length,
  });

  return result;
}

/**
 * Brings a single member's email account in line with all of the
 * organization's rules. Used when a member joins or changes team.
 */
export async function syncOrganizationRulesForMember({
  emailAccountId,
  organizationId,
  logger,
}: {
  emailAccountId: string;
  organizationId: string;
  logger: Logger;
}) {
  const [member, organizationRules, existingManagedRules] = await Promise.all([
    prisma.member.findFirst({
      where: { emailAccountId, organizationId },
      select: { teamId: true },
    }),
    prisma.organizationRule.findMany({
      where: { organizationId },
      include: organizationRuleInclude,
    }),
    prisma.rule.findMany({
      where: { emailAccountId, organizationRule: { organizationId } },
      select: { id: true, organizationRuleId: true },
    }),
  ]);

  const applicableRules = member
    ? organizationRules.filter((rule) =>
        organizationRuleAppliesToMember({
          ruleTeamIds: rule.teams.map((team) => team.id),
          memberTeamId: member.teamId,
        }),
      )
    : [];

  const applicableRuleIds = new Set(applicableRules.map((rule) => rule.id));
  const ruleIdsToRemove = existingManagedRules
    .filter(
      (rule) =>
        !rule.organizationRuleId ||
        !applicableRuleIds.has(rule.organizationRuleId),
    )
    .map((rule) => rule.id);

  if (ruleIdsToRemove.length > 0) {
    await prisma.rule.deleteMany({
      where: { id: { in: ruleIdsToRemove }, emailAccountId },
    });
  }

  for (const organizationRule of applicableRules) {
    await applyOrganizationRuleToAccount({
      organizationRule,
      emailAccountId,
      existingRuleId: existingManagedRules.find(
        (rule) => rule.organizationRuleId === organizationRule.id,
      )?.id,
      logger,
    });
  }

  logger.info("Synced organization rules for member", {
    organizationId,
    syncedEmailAccountId: emailAccountId,
    applicableRules: applicableRules.length,
    removedRules: ruleIdsToRemove.length,
  });
}

export async function removeOrganizationRulesForMember({
  emailAccountId,
  organizationId,
}: {
  emailAccountId: string;
  organizationId: string;
}) {
  await prisma.rule.deleteMany({
    where: { emailAccountId, organizationRule: { organizationId } },
  });
}

async function applyOrganizationRuleToAccount({
  organizationRule,
  emailAccountId,
  existingRuleId,
  logger,
}: {
  organizationRule: OrganizationRuleWithRelations;
  emailAccountId: string;
  existingRuleId?: string;
  logger: Logger;
}): Promise<
  | { status: "created" }
  | { status: "updated" }
  | { status: "skipped"; reason: string }
> {
  const data = {
    name: organizationRule.name,
    enabled: organizationRule.enabled,
    runOnThreads: organizationRule.runOnThreads,
    conditionalOperator: organizationRule.conditionalOperator,
    instructions: organizationRule.instructions,
    from: organizationRule.from,
    to: organizationRule.to,
    subject: organizationRule.subject,
    body: organizationRule.body,
  };
  const actions = organizationRule.actions.map(toRuleActionData);

  try {
    if (existingRuleId) {
      await replaceRuleWithResolvedActions({
        ruleId: existingRuleId,
        emailAccountId,
        data,
        actions,
        allowOrganizationManaged: true,
      });
      return { status: "updated" };
    }

    await createRuleWithResolvedActions({
      emailAccountId,
      data: { ...data, organizationRuleId: organizationRule.id },
      actions,
    });
    return { status: "created" };
  } catch (error) {
    if (isDuplicateError(error, "name")) {
      return {
        status: "skipped",
        reason: `A rule named "${organizationRule.name}" already exists in this account`,
      };
    }
    if (error instanceof SafeError) {
      return {
        status: "skipped",
        reason: error.safeMessage || "Rule could not be applied",
      };
    }

    logger.error("Failed to apply organization rule to account", {
      error,
      organizationRuleId: organizationRule.id,
      targetEmailAccountId: emailAccountId,
    });
    return { status: "skipped", reason: "Unexpected error" };
  }
}

function toRuleActionData(
  action: OrganizationRuleWithRelations["actions"][number],
): RuleActionCreateData {
  return {
    type: action.type,
    // keep label/folder names; account-specific IDs are resolved at execution time
    label: action.label,
    labelId: null,
    subject: action.subject,
    content: action.content,
    to: action.to,
    cc: action.cc,
    bcc: action.bcc,
    url: action.url,
    folderName: action.folderName,
    folderId: null,
    delayInMinutes: action.delayInMinutes,
  };
}
