"use server";

import { revalidatePath } from "next/cache";
import {
  type CreateRuleBody,
  createRuleBody,
  type UpdateRuleBody,
  updateRuleBody,
  updateRuleInstructionsBody,
  type UpdateRuleInstructionsBody,
} from "@/utils/actions/validation";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma, { isDuplicateError, isNotFoundError } from "@/utils/prisma";
import {
  rulesExamplesBody,
  type RulesExamplesBody,
} from "@/utils/actions/validation";
import { getGmailAccessToken, getGmailClient } from "@/utils/gmail/client";
import { aiFindExampleMatches } from "@/utils/ai/example-matches/find-example-matches";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import { flattenConditions } from "@/utils/condition";
import { LogicalOperator, RuleType } from "@prisma/client";
import {
  updatePromptFileOnRuleUpdated,
  updateRuleInstructionsAndPromptFile,
  updatePromptFileOnRuleCreated,
} from "@/utils/rule/prompt-file";
import { generatePromptOnDeleteRule } from "@/utils/ai/rule/generate-prompt-on-delete-rule";
import { sanitizeActionFields } from "@/utils/action-item";
import { deleteRule } from "@/utils/rule/rule";

export const createRuleAction = withActionInstrumentation(
  "createRule",
  async (options: CreateRuleBody) => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    const { data: body, error } = createRuleBody.safeParse(options);
    if (error) return { error: error.message };

    const conditions = flattenConditions(body.conditions);

    try {
      const rule = await prisma.rule.create({
        data: {
          name: body.name || "",
          automate: body.automate ?? undefined,
          runOnThreads: body.runOnThreads ?? undefined,
          actions: body.actions
            ? {
                createMany: {
                  data: body.actions.map(
                    ({ type, label, subject, content, to, cc, bcc, url }) => {
                      return sanitizeActionFields({
                        type,
                        label: label?.value,
                        subject: subject?.value,
                        content: content?.value,
                        to: to?.value,
                        cc: cc?.value,
                        bcc: bcc?.value,
                        url: url?.value,
                      });
                    },
                  ),
                },
              }
            : undefined,
          userId: session.user.id,
          conditionalOperator: body.conditionalOperator || LogicalOperator.AND,
          // conditions
          instructions: conditions.instructions || null,
          from: conditions.from || null,
          to: conditions.to || null,
          subject: conditions.subject || null,
          // body: conditions.body || null,
          categoryFilterType: conditions.categoryFilterType || null,
          categoryFilters:
            conditions.categoryFilterType && conditions.categoryFilters
              ? {
                  connect: conditions.categoryFilters.map((id) => ({ id })),
                }
              : {},
        },
        include: { actions: true, categoryFilters: true, group: true },
      });

      await updatePromptFileOnRuleCreated(session.user.id, rule);

      revalidatePath("/automation");

      return { rule };
    } catch (error) {
      if (isDuplicateError(error, "name")) {
        return { error: "Rule name already exists" };
      }
      if (isDuplicateError(error, "groupId")) {
        return {
          error: "Group already has a rule. Please use the existing rule.",
        };
      }
      return { error: "Error creating rule." };
    }
  },
);

export const updateRuleAction = withActionInstrumentation(
  "updateRule",
  async (options: UpdateRuleBody) => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    const { data: body, error } = updateRuleBody.safeParse(options);
    if (error) return { error: error.message };

    const conditions = flattenConditions(body.conditions);

    try {
      const currentRule = await prisma.rule.findUnique({
        where: { id: body.id, userId: session.user.id },
        include: { actions: true, categoryFilters: true, group: true },
      });
      if (!currentRule) return { error: "Rule not found" };

      const currentActions = currentRule.actions;

      const actionsToDelete = currentActions.filter(
        (currentAction) => !body.actions.find((a) => a.id === currentAction.id),
      );
      const actionsToUpdate = body.actions.filter((a) => a.id);
      const actionsToCreate = body.actions.filter((a) => !a.id);

      const [updatedRule] = await prisma.$transaction([
        // update rule
        prisma.rule.update({
          where: { id: body.id, userId: session.user.id },
          data: {
            automate: body.automate ?? undefined,
            runOnThreads: body.runOnThreads ?? undefined,
            name: body.name || undefined,
            conditionalOperator:
              body.conditionalOperator || LogicalOperator.AND,
            // conditions
            instructions: conditions.instructions || null,
            from: conditions.from || null,
            to: conditions.to || null,
            subject: conditions.subject || null,
            // body: conditions.body || null,
            categoryFilterType: conditions.categoryFilterType || null,
            categoryFilters:
              conditions.categoryFilterType && conditions.categoryFilters
                ? {
                    set: conditions.categoryFilters.map((id) => ({ id })),
                  }
                : { set: [] },
          },
          include: { actions: true, categoryFilters: true, group: true },
        }),
        // delete removed actions
        ...(actionsToDelete.length
          ? [
              prisma.action.deleteMany({
                where: { id: { in: actionsToDelete.map((a) => a.id) } },
              }),
            ]
          : []),
        // update existing actions
        ...actionsToUpdate.map((a) => {
          return prisma.action.update({
            where: { id: a.id },
            data: sanitizeActionFields({
              type: a.type,
              label: a.label?.value,
              subject: a.subject?.value,
              content: a.content?.value,
              to: a.to?.value,
              cc: a.cc?.value,
              bcc: a.bcc?.value,
              url: a.url?.value,
            }),
          });
        }),
        // create new actions
        ...(actionsToCreate.length
          ? [
              prisma.action.createMany({
                data: actionsToCreate.map((a) => {
                  return {
                    ...sanitizeActionFields({
                      type: a.type,
                      label: a.label?.value,
                      subject: a.subject?.value,
                      content: a.content?.value,
                      to: a.to?.value,
                      cc: a.cc?.value,
                      bcc: a.bcc?.value,
                      url: a.url?.value,
                    }),
                    ruleId: body.id,
                  };
                }),
              }),
            ]
          : []),
      ]);

      // update prompt file
      await updatePromptFileOnRuleUpdated(
        session.user.id,
        currentRule,
        updatedRule,
      );

      revalidatePath(`/automation/rule/${body.id}`);
      revalidatePath("/automation");

      return { rule: updatedRule };
    } catch (error) {
      if (isDuplicateError(error, "name")) {
        return { error: "Rule name already exists" };
      }
      if (isDuplicateError(error, "groupId")) {
        return {
          error: "Group already has a rule. Please use the existing rule.",
        };
      }
      return { error: "Error updating rule." };
    }
  },
);

export const updateRuleInstructionsAction = withActionInstrumentation(
  "updateRuleInstructions",
  async (options: UpdateRuleInstructionsBody) => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    const { data: body, error } = updateRuleInstructionsBody.safeParse(options);
    if (error) return { error: error.message };

    const currentRule = await prisma.rule.findUnique({
      where: { id: body.id, userId: session.user.id },
      include: { actions: true, categoryFilters: true, group: true },
    });
    if (!currentRule) return { error: "Rule not found" };

    await updateRuleInstructionsAndPromptFile({
      userId: session.user.id,
      ruleId: body.id,
      instructions: body.instructions,
      currentRule,
    });

    revalidatePath(`/automation/rule/${body.id}`);
    revalidatePath("/automation");
  },
);

export const deleteRuleAction = withActionInstrumentation(
  "deleteRule",
  async ({ ruleId }: { ruleId: string }) => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    const rule = await prisma.rule.findUnique({
      where: { id: ruleId },
      include: { actions: true, categoryFilters: true, group: true },
    });
    if (!rule) return; // already deleted
    if (rule.userId !== session.user.id)
      return { error: "You don't have permission to delete this rule" };

    try {
      await deleteRule({
        ruleId,
        userId: session.user.id,
        groupId: rule.groupId,
      });

      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          email: true,
          aiModel: true,
          aiProvider: true,
          aiApiKey: true,
          rulesPrompt: true,
        },
      });
      if (!user) return { error: "User not found" };

      if (!user.rulesPrompt) return;

      const updatedPrompt = await generatePromptOnDeleteRule({
        user,
        existingPrompt: user.rulesPrompt,
        deletedRule: rule,
      });

      await prisma.user.update({
        where: { id: session.user.id },
        data: { rulesPrompt: updatedPrompt },
      });

      revalidatePath(`/automation/rule/${ruleId}`);
      revalidatePath("/automation");
    } catch (error) {
      if (isNotFoundError(error)) return;
      throw error;
    }
  },
);

export const getRuleExamplesAction = withActionInstrumentation(
  "getRuleExamples",
  async (unsafeData: RulesExamplesBody) => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    const { success, error, data } = rulesExamplesBody.safeParse(unsafeData);
    if (!success) return { error: error.message };

    const gmail = getGmailClient(session);
    const token = await getGmailAccessToken(session);

    if (!token.token) return { error: "No access token" };

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        email: true,
        aiModel: true,
        aiProvider: true,
        aiApiKey: true,
      },
    });
    if (!user) return { error: "User not found" };

    const { matches } = await aiFindExampleMatches(
      user,
      gmail,
      token.token,
      data.rulesPrompt,
    );

    return { matches };
  },
);
