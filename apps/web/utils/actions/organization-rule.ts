"use server";

import { actionClient, actionClientUser } from "@/utils/actions/safe-action";
import { getAuthorizedOrganizationAdminMembership } from "@/utils/organizations/access";
import {
  createOrganizationRule,
  updateOrganizationRule,
  deleteOrganizationRuleAndMemberCopies,
  setOrganizationRuleEnabled,
  setMemberOrganizationRuleEnabled,
  type OrganizationRuleActionInput,
} from "@/utils/organizations/rules";
import {
  createOrganizationRuleBody,
  updateOrganizationRuleBody,
  deleteOrganizationRuleBody,
  setOrganizationRuleEnabledBody,
  setMemberOrganizationRuleEnabledBody,
  type OrganizationRuleActionSchema,
} from "@/utils/actions/organization-rule.validation";

const UNAUTHORIZED_MESSAGE =
  "Only organization owners or admins can manage organization rules.";

export const createOrganizationRuleAction = actionClientUser
  .metadata({ name: "createOrganizationRule" })
  .inputSchema(createOrganizationRuleBody)
  .action(
    async ({
      ctx: { userId, logger },
      parsedInput: { organizationId, actions, ...rest },
    }) => {
      await getAuthorizedOrganizationAdminMembership({
        organizationId,
        userId,
        unauthorizedMessage: UNAUTHORIZED_MESSAGE,
      });

      const organizationRule = await createOrganizationRule({
        organizationId,
        data: rest,
        actions: toActionInputs(actions),
        logger,
      });

      return { organizationRuleId: organizationRule.id };
    },
  );

export const updateOrganizationRuleAction = actionClientUser
  .metadata({ name: "updateOrganizationRule" })
  .inputSchema(updateOrganizationRuleBody)
  .action(
    async ({
      ctx: { userId, logger },
      parsedInput: { organizationId, organizationRuleId, actions, ...rest },
    }) => {
      await getAuthorizedOrganizationAdminMembership({
        organizationId,
        userId,
        unauthorizedMessage: UNAUTHORIZED_MESSAGE,
      });

      await updateOrganizationRule({
        organizationRuleId,
        organizationId,
        data: rest,
        actions: toActionInputs(actions),
        logger,
      });
    },
  );

export const deleteOrganizationRuleAction = actionClientUser
  .metadata({ name: "deleteOrganizationRule" })
  .inputSchema(deleteOrganizationRuleBody)
  .action(
    async ({
      ctx: { userId },
      parsedInput: { organizationId, organizationRuleId },
    }) => {
      await getAuthorizedOrganizationAdminMembership({
        organizationId,
        userId,
        unauthorizedMessage: UNAUTHORIZED_MESSAGE,
      });

      await deleteOrganizationRuleAndMemberCopies({
        organizationRuleId,
        organizationId,
      });
    },
  );

export const setOrganizationRuleEnabledAction = actionClientUser
  .metadata({ name: "setOrganizationRuleEnabled" })
  .inputSchema(setOrganizationRuleEnabledBody)
  .action(
    async ({
      ctx: { userId },
      parsedInput: { organizationId, organizationRuleId, enabled },
    }) => {
      await getAuthorizedOrganizationAdminMembership({
        organizationId,
        userId,
        unauthorizedMessage: UNAUTHORIZED_MESSAGE,
      });

      await setOrganizationRuleEnabled({
        organizationRuleId,
        organizationId,
        enabled,
      });
    },
  );

export const setMemberOrganizationRuleEnabledAction = actionClient
  .metadata({ name: "setMemberOrganizationRuleEnabled" })
  .inputSchema(setMemberOrganizationRuleEnabledBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { ruleId, enabled } }) => {
      await setMemberOrganizationRuleEnabled({
        ruleId,
        emailAccountId,
        enabled,
      });
    },
  );

function toActionInputs(
  actions: OrganizationRuleActionSchema[],
): OrganizationRuleActionInput[] {
  return actions.map((action) => ({
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
    ...(action.staticAttachments
      ? { staticAttachments: action.staticAttachments }
      : {}),
  }));
}
