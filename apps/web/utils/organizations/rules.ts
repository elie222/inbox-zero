import type {
  Prisma,
  OrganizationRule,
  OrganizationRuleAction,
} from "@/generated/prisma/client";
import { ActionType } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { isDuplicateError } from "@/utils/prisma-helpers";
import type { Logger } from "@/utils/logger";
import type { RuleActionCreateData } from "@/utils/rule/rule";

export const RULE_MANAGED_BY_ORGANIZATION_ERROR =
  "This rule is managed by your organization and can't be edited here. Ask an organization admin to change it.";

// Only fields safe to materialize for every member; account-specific ids are resolved at execution.
export const ORGANIZATION_RULE_ACTION_COPY_FIELDS = [
  "type",
  "label",
  "subject",
  "content",
  "to",
  "cc",
  "bcc",
  "url",
  "folderName",
  "delayInMinutes",
  "staticAttachments",
] as const satisfies readonly (keyof OrganizationRuleAction &
  keyof RuleActionCreateData)[];

const MAX_NAME_CONFLICT_RETRIES = 5;

const UNSUPPORTED_ORGANIZATION_ACTION_TYPES: ActionType[] = [
  ActionType.NOTIFY_MESSAGING_CHANNEL,
  ActionType.DRAFT_MESSAGING_CHANNEL,
];

export type OrganizationRuleActionInput = Omit<
  Prisma.OrganizationRuleActionCreateManyOrganizationRuleInput,
  "id" | "createdAt" | "updatedAt"
>;

export type OrganizationRuleData = {
  name: string;
  instructions?: string | null;
  enabled?: boolean;
  runOnThreads?: boolean;
  conditionalOperator?: Prisma.OrganizationRuleCreateInput["conditionalOperator"];
  from?: string | null;
  to?: string | null;
  subject?: string | null;
  body?: string | null;
};

export function computeMemberRuleEnabled({
  orgEnabled,
  memberEnabled,
}: {
  orgEnabled: boolean;
  memberEnabled: boolean;
}): boolean {
  return orgEnabled && memberEnabled;
}

export function assertOrganizationRuleActionsSupported(
  actions: { type: ActionType }[],
) {
  const unsupported = actions.find((action) =>
    UNSUPPORTED_ORGANIZATION_ACTION_TYPES.includes(action.type),
  );
  if (unsupported) {
    throw new SafeError(
      "Messaging channel actions can't be used in organization rules because each member needs their own channel.",
    );
  }
}

export async function assertRuleIsNotOrgManaged({
  ruleId,
  emailAccountId,
}: {
  ruleId: string;
  emailAccountId: string;
}) {
  const rule = await prisma.rule.findUnique({
    where: { id_emailAccountId: { id: ruleId, emailAccountId } },
    select: { organizationRuleId: true },
  });
  if (rule?.organizationRuleId) {
    throw new SafeError(RULE_MANAGED_BY_ORGANIZATION_ERROR);
  }
}

export async function createOrganizationRule({
  organizationId,
  data,
  actions,
  logger,
}: {
  organizationId: string;
  data: OrganizationRuleData;
  actions: OrganizationRuleActionInput[];
  logger: Logger;
}) {
  assertOrganizationRuleActionsSupported(actions);

  const organizationRule = await prisma.organizationRule
    .create({
      data: {
        organizationId,
        name: data.name,
        instructions: data.instructions ?? undefined,
        enabled: data.enabled ?? undefined,
        runOnThreads: data.runOnThreads ?? undefined,
        conditionalOperator: data.conditionalOperator ?? undefined,
        from: data.from ?? undefined,
        to: data.to ?? undefined,
        subject: data.subject ?? undefined,
        body: data.body ?? undefined,
        actions: { createMany: { data: actions } },
      },
    })
    .catch(rethrowDuplicateNameError);

  await syncOrganizationRuleToMembers({
    organizationRuleId: organizationRule.id,
    logger,
  });

  return organizationRule;
}

export async function updateOrganizationRule({
  organizationRuleId,
  organizationId,
  data,
  actions,
  logger,
}: {
  organizationRuleId: string;
  organizationId: string;
  data: OrganizationRuleData;
  actions: OrganizationRuleActionInput[];
  logger: Logger;
}) {
  assertOrganizationRuleActionsSupported(actions);

  const existing = await prisma.organizationRule.findFirst({
    where: { id: organizationRuleId, organizationId },
    select: { id: true },
  });
  if (!existing) throw new SafeError("Organization rule not found");

  const organizationRule = await prisma.organizationRule
    .update({
      where: { id: organizationRuleId },
      data: {
        name: data.name,
        instructions: data.instructions ?? null,
        runOnThreads: data.runOnThreads,
        conditionalOperator: data.conditionalOperator ?? undefined,
        from: data.from ?? null,
        to: data.to ?? null,
        subject: data.subject ?? null,
        body: data.body ?? null,
        actions: { deleteMany: {}, createMany: { data: actions } },
      },
    })
    .catch(rethrowDuplicateNameError);

  await syncOrganizationRuleToMembers({ organizationRuleId, logger });

  return organizationRule;
}

export async function deleteOrganizationRuleAndMemberCopies({
  organizationRuleId,
  organizationId,
}: {
  organizationRuleId: string;
  organizationId: string;
}) {
  await prisma.organizationRule.deleteMany({
    where: { id: organizationRuleId, organizationId },
  });
}

export async function setOrganizationRuleEnabled({
  organizationRuleId,
  organizationId,
  enabled,
}: {
  organizationRuleId: string;
  organizationId: string;
  enabled: boolean;
}) {
  const updated = await prisma.organizationRule.updateMany({
    where: { id: organizationRuleId, organizationId },
    data: { enabled },
  });
  if (updated.count === 0) throw new SafeError("Organization rule not found");

  // Re-derive each copy's enabled from the new org state and the member's opt-in.
  if (enabled) {
    await prisma.rule.updateMany({
      where: {
        organizationRuleId,
        NOT: { organizationRuleMemberEnabled: false },
      },
      data: { enabled: true },
    });
    await prisma.rule.updateMany({
      where: { organizationRuleId, organizationRuleMemberEnabled: false },
      data: { enabled: false },
    });
  } else {
    await prisma.rule.updateMany({
      where: { organizationRuleId },
      data: { enabled: false },
    });
  }
}

export async function setMemberOrganizationRuleEnabled({
  ruleId,
  emailAccountId,
  enabled,
}: {
  ruleId: string;
  emailAccountId: string;
  enabled: boolean;
}) {
  const rule = await prisma.rule.findUnique({
    where: { id_emailAccountId: { id: ruleId, emailAccountId } },
    select: {
      organizationRuleId: true,
      organizationRule: { select: { enabled: true } },
    },
  });

  if (!rule?.organizationRuleId || !rule.organizationRule) {
    throw new SafeError("This rule is not managed by your organization.");
  }

  await prisma.rule.update({
    where: { id_emailAccountId: { id: ruleId, emailAccountId } },
    data: {
      organizationRuleMemberEnabled: enabled,
      enabled: computeMemberRuleEnabled({
        orgEnabled: rule.organizationRule.enabled,
        memberEnabled: enabled,
      }),
    },
  });
}

export async function syncOrganizationRuleToMembers({
  organizationRuleId,
  logger,
}: {
  organizationRuleId: string;
  logger: Logger;
}) {
  const organizationRule = await prisma.organizationRule.findUnique({
    where: { id: organizationRuleId },
    include: { actions: true },
  });
  if (!organizationRule) throw new SafeError("Organization rule not found");

  const members = await prisma.member.findMany({
    where: { organizationId: organizationRule.organizationId },
    select: { emailAccountId: true },
  });

  const actionsCreateData = mapOrganizationRuleActions(
    organizationRule.actions,
  );

  for (const member of members) {
    await materializeMemberRuleCopy({
      organizationRule,
      emailAccountId: member.emailAccountId,
      actionsCreateData,
      logger,
    });
  }
}

export async function syncOrganizationRulesForNewMember({
  organizationId,
  emailAccountId,
  logger,
}: {
  organizationId: string;
  emailAccountId: string;
  logger: Logger;
}) {
  const organizationRules = await prisma.organizationRule.findMany({
    where: { organizationId },
    include: { actions: true },
  });

  for (const organizationRule of organizationRules) {
    await materializeMemberRuleCopy({
      organizationRule,
      emailAccountId,
      actionsCreateData: mapOrganizationRuleActions(organizationRule.actions),
      logger,
    });
  }
}

function rethrowDuplicateNameError(error: unknown): never {
  if (isDuplicateError(error, "name")) {
    throw new SafeError("An organization rule with this name already exists.");
  }
  throw error;
}

function mapOrganizationRuleActions(
  actions: OrganizationRuleAction[],
): RuleActionCreateData[] {
  return actions.map((action) => {
    const data: Record<string, unknown> = {};
    for (const field of ORGANIZATION_RULE_ACTION_COPY_FIELDS) {
      const value = action[field];
      if (value !== null && value !== undefined) {
        data[field] = value;
      }
    }
    return data as RuleActionCreateData;
  });
}

async function materializeMemberRuleCopy({
  organizationRule,
  emailAccountId,
  actionsCreateData,
  logger,
}: {
  organizationRule: OrganizationRule;
  emailAccountId: string;
  actionsCreateData: RuleActionCreateData[];
  logger: Logger;
}) {
  const existing = await prisma.rule.findFirst({
    where: { emailAccountId, organizationRuleId: organizationRule.id },
    select: { id: true, organizationRuleMemberEnabled: true },
  });

  const memberEnabled = existing?.organizationRuleMemberEnabled ?? true;
  const enabled = computeMemberRuleEnabled({
    orgEnabled: organizationRule.enabled,
    memberEnabled,
  });

  const writeCopy = (name: string) => {
    const data = {
      name,
      instructions: organizationRule.instructions,
      runOnThreads: organizationRule.runOnThreads,
      conditionalOperator: organizationRule.conditionalOperator,
      from: organizationRule.from,
      to: organizationRule.to,
      subject: organizationRule.subject,
      body: organizationRule.body,
      enabled,
      organizationRuleMemberEnabled: memberEnabled,
    };
    return existing
      ? prisma.rule.update({
          where: { id: existing.id, emailAccountId },
          data: {
            ...data,
            actions: {
              deleteMany: {},
              createMany: { data: actionsCreateData },
            },
          },
        })
      : prisma.rule.create({
          data: {
            ...data,
            emailAccountId,
            organizationRuleId: organizationRule.id,
            actions: { createMany: { data: actionsCreateData } },
          },
        });
  };

  for (let attempt = 0; attempt < MAX_NAME_CONFLICT_RETRIES; attempt++) {
    const name =
      attempt === 0
        ? organizationRule.name
        : await availableRuleName({
            emailAccountId,
            desiredName: organizationRule.name,
            excludeOrganizationRuleId: organizationRule.id,
          });
    try {
      await writeCopy(name);
      return;
    } catch (error) {
      // A concurrent sync already materialized this copy.
      if (isDuplicateError(error, ["emailAccountId", "organizationRuleId"])) {
        return;
      }
      if (isDuplicateError(error, "name")) continue;
      throw error;
    }
  }

  // Use a stable suffix as a final fallback after repeated concurrent conflicts.
  logger.warn(
    "Using fallback name for org rule copy after repeated conflicts",
    {
      organizationRuleId: organizationRule.id,
      emailAccountId,
    },
  );
  try {
    await writeCopy(
      await availableRuleName({
        emailAccountId,
        desiredName: `${organizationRule.name} (${organizationRule.id})`,
        excludeOrganizationRuleId: organizationRule.id,
      }),
    );
  } catch (error) {
    if (isDuplicateError(error, ["emailAccountId", "organizationRuleId"])) {
      return;
    }
    throw error;
  }
}

async function availableRuleName({
  emailAccountId,
  desiredName,
  excludeOrganizationRuleId,
}: {
  emailAccountId: string;
  desiredName: string;
  excludeOrganizationRuleId: string;
}): Promise<string> {
  const rules = await prisma.rule.findMany({
    where: {
      emailAccountId,
      name: { startsWith: desiredName },
      NOT: { organizationRuleId: excludeOrganizationRuleId },
    },
    select: { name: true },
  });
  const taken = new Set(rules.map((rule) => rule.name));
  if (!taken.has(desiredName)) return desiredName;

  let suffix = 2;
  while (taken.has(`${desiredName} (${suffix})`)) suffix++;
  return `${desiredName} (${suffix})`;
}
