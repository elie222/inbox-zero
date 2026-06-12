"use server";

import { actionClientUser } from "@/utils/actions/safe-action";
import {
  createOrganizationRuleBody,
  updateOrganizationRuleBody,
  deleteOrganizationRuleBody,
  toggleOrganizationRuleBody,
  createOrganizationTeamBody,
  deleteOrganizationTeamBody,
  updateMemberTeamBody,
} from "@/utils/actions/organization-rule.validation";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { getAuthorizedOrganizationAdminMembership } from "@/utils/organizations/access";
import {
  syncOrganizationRule,
  syncOrganizationRulesForMember,
} from "@/utils/organizations/organization-rules";
import { assertCanUseDigestsIfNeeded } from "@/utils/premium/server";
import type { CreateOrganizationRuleBody } from "@/utils/actions/organization-rule.validation";

const ADMIN_ONLY_MESSAGE =
  "Only organization owners or admins can manage organization rules.";

export const createOrganizationRuleAction = actionClientUser
  .metadata({ name: "createOrganizationRule" })
  .inputSchema(createOrganizationRuleBody)
  .action(
    async ({
      ctx: { userId, logger },
      parsedInput: { organizationId, teamIds, actions, ...ruleFields },
    }) => {
      await getAuthorizedOrganizationAdminMembership({
        organizationId,
        userId,
        unauthorizedMessage: ADMIN_ONLY_MESSAGE,
      });

      await assertCanUseDigestsIfNeeded(userId, actions);
      await assertTeamsBelongToOrganization({ organizationId, teamIds });

      let organizationRule: { id: string };
      try {
        organizationRule = await prisma.organizationRule.create({
          data: {
            organizationId,
            ...toOrganizationRuleRecord(ruleFields),
            actions: { createMany: { data: actions.map(toActionRecord) } },
            ...connectTeams(teamIds),
          },
          select: { id: true },
        });
      } catch (error) {
        throw translateDuplicateNameError(error);
      }

      const sync = await syncOrganizationRule({
        organizationRuleId: organizationRule.id,
        logger,
      });

      return { id: organizationRule.id, sync };
    },
  );

export const updateOrganizationRuleAction = actionClientUser
  .metadata({ name: "updateOrganizationRule" })
  .inputSchema(updateOrganizationRuleBody)
  .action(
    async ({
      ctx: { userId, logger },
      parsedInput: { id, teamIds, actions, ...ruleFields },
    }) => {
      const { organizationId } = await getAuthorizedOrganizationRule({
        organizationRuleId: id,
        userId,
      });

      await assertCanUseDigestsIfNeeded(userId, actions);
      await assertTeamsBelongToOrganization({ organizationId, teamIds });

      try {
        await prisma.organizationRule.update({
          where: { id },
          data: {
            ...toOrganizationRuleRecord(ruleFields),
            actions: {
              deleteMany: {},
              createMany: { data: actions.map(toActionRecord) },
            },
            teams: { set: (teamIds ?? []).map((teamId) => ({ id: teamId })) },
          },
        });
      } catch (error) {
        throw translateDuplicateNameError(error);
      }

      const sync = await syncOrganizationRule({
        organizationRuleId: id,
        logger,
      });

      return { id, sync };
    },
  );

export const deleteOrganizationRuleAction = actionClientUser
  .metadata({ name: "deleteOrganizationRule" })
  .inputSchema(deleteOrganizationRuleBody)
  .action(async ({ ctx: { userId, logger }, parsedInput: { id } }) => {
    await getAuthorizedOrganizationRule({ organizationRuleId: id, userId });

    // deleting cascades to the managed rules provisioned in member accounts
    await prisma.organizationRule.delete({ where: { id } });

    logger.info("Deleted organization rule", { organizationRuleId: id });
  });

export const toggleOrganizationRuleAction = actionClientUser
  .metadata({ name: "toggleOrganizationRule" })
  .inputSchema(toggleOrganizationRuleBody)
  .action(async ({ ctx: { userId }, parsedInput: { id, enabled } }) => {
    await getAuthorizedOrganizationRule({ organizationRuleId: id, userId });

    await prisma.organizationRule.update({
      where: { id },
      data: { enabled },
    });
    await prisma.rule.updateMany({
      where: { organizationRuleId: id },
      data: { enabled },
    });
  });

export const createOrganizationTeamAction = actionClientUser
  .metadata({ name: "createOrganizationTeam" })
  .inputSchema(createOrganizationTeamBody)
  .action(
    async ({ ctx: { userId }, parsedInput: { organizationId, name } }) => {
      await getAuthorizedOrganizationAdminMembership({
        organizationId,
        userId,
        unauthorizedMessage:
          "Only organization owners or admins can manage teams.",
      });

      try {
        return await prisma.organizationTeam.create({
          data: { organizationId, name },
          select: { id: true, name: true },
        });
      } catch (error) {
        if (isDuplicateError(error, "name")) {
          throw new SafeError("A team with this name already exists.");
        }
        throw error;
      }
    },
  );

export const deleteOrganizationTeamAction = actionClientUser
  .metadata({ name: "deleteOrganizationTeam" })
  .inputSchema(deleteOrganizationTeamBody)
  .action(async ({ ctx: { userId }, parsedInput: { id } }) => {
    const team = await prisma.organizationTeam.findUnique({
      where: { id },
      select: {
        organizationId: true,
        _count: { select: { rules: true } },
      },
    });

    if (!team) throw new SafeError("Team not found.");

    await getAuthorizedOrganizationAdminMembership({
      organizationId: team.organizationId,
      userId,
      unauthorizedMessage:
        "Only organization owners or admins can manage teams.",
    });

    // Deleting a team a rule targets would silently widen the rule to all
    // members, so require admins to retarget those rules first.
    if (team._count.rules > 0) {
      throw new SafeError(
        "This team is used by organization rules. Remove it from those rules first.",
      );
    }

    await prisma.organizationTeam.delete({ where: { id } });
  });

export const updateMemberTeamAction = actionClientUser
  .metadata({ name: "updateMemberTeam" })
  .inputSchema(updateMemberTeamBody)
  .action(
    async ({ ctx: { userId, logger }, parsedInput: { memberId, teamId } }) => {
      const member = await prisma.member.findUnique({
        where: { id: memberId },
        select: { organizationId: true, emailAccountId: true },
      });

      if (!member) throw new SafeError("Member not found.");

      await getAuthorizedOrganizationAdminMembership({
        organizationId: member.organizationId,
        userId,
        unauthorizedMessage:
          "Only organization owners or admins can assign teams.",
      });

      if (teamId) {
        const team = await prisma.organizationTeam.findFirst({
          where: { id: teamId, organizationId: member.organizationId },
          select: { id: true },
        });
        if (!team) throw new SafeError("Team not found.");
      }

      await prisma.member.update({
        where: { id: memberId },
        data: { teamId },
      });

      await syncOrganizationRulesForMember({
        emailAccountId: member.emailAccountId,
        organizationId: member.organizationId,
        logger,
      });
    },
  );

async function getAuthorizedOrganizationRule({
  organizationRuleId,
  userId,
}: {
  organizationRuleId: string;
  userId: string;
}) {
  const organizationRule = await prisma.organizationRule.findUnique({
    where: { id: organizationRuleId },
    select: { organizationId: true },
  });

  if (!organizationRule) throw new SafeError("Organization rule not found.");

  await getAuthorizedOrganizationAdminMembership({
    organizationId: organizationRule.organizationId,
    userId,
    unauthorizedMessage: ADMIN_ONLY_MESSAGE,
  });

  return organizationRule;
}

async function assertTeamsBelongToOrganization({
  organizationId,
  teamIds,
}: {
  organizationId: string;
  teamIds?: string[];
}) {
  if (!teamIds?.length) return;

  const teams = await prisma.organizationTeam.findMany({
    where: { id: { in: teamIds }, organizationId },
    select: { id: true },
  });

  if (teams.length !== new Set(teamIds).size) {
    throw new SafeError("Team not found.");
  }
}

function toOrganizationRuleRecord(
  ruleFields: Omit<
    CreateOrganizationRuleBody,
    "organizationId" | "teamIds" | "actions"
  >,
) {
  return {
    name: ruleFields.name,
    instructions: ruleFields.instructions ?? null,
    from: ruleFields.from ?? null,
    to: ruleFields.to ?? null,
    subject: ruleFields.subject ?? null,
    body: ruleFields.body ?? null,
    conditionalOperator: ruleFields.conditionalOperator,
    runOnThreads: ruleFields.runOnThreads,
  };
}

function toActionRecord(action: CreateOrganizationRuleBody["actions"][number]) {
  return {
    type: action.type,
    label: action.label ?? null,
    subject: action.subject ?? null,
    content: action.content ?? null,
    to: action.to ?? null,
    cc: action.cc ?? null,
    bcc: action.bcc ?? null,
    url: action.url ?? null,
    folderName: action.folderName ?? null,
    delayInMinutes: action.delayInMinutes ?? null,
  };
}

function connectTeams(teamIds?: string[]) {
  if (!teamIds?.length) return {};
  return { teams: { connect: teamIds.map((id) => ({ id })) } };
}

function translateDuplicateNameError(error: unknown) {
  if (isDuplicateError(error, "name")) {
    return new SafeError("An organization rule with this name already exists.");
  }
  return error;
}
