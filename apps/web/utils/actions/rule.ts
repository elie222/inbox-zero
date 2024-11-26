"use server";

import { revalidatePath } from "next/cache";
import {
  type CreateRuleBody,
  createRuleBody,
  type UpdateRuleBody,
  updateRuleBody,
} from "@/utils/actions/validation";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma, { isDuplicateError } from "@/utils/prisma";
import {
  rulesExamplesBody,
  type RulesExamplesBody,
} from "@/utils/actions/validation";
import { getGmailAccessToken, getGmailClient } from "@/utils/gmail/client";
import { aiFindExampleMatches } from "@/utils/ai/example-matches/find-example-matches";
import { withActionInstrumentation } from "@/utils/actions/middleware";

export const createRuleAction = withActionInstrumentation(
  "createRule",
  async (options: CreateRuleBody) => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    const { data: body, error } = createRuleBody.safeParse(options);
    if (error) return { error: error.message };

    try {
      const rule = await prisma.rule.create({
        data: {
          type: body.type,
          name: body.name || "",
          instructions: body.instructions || "",
          automate: body.automate ?? undefined,
          runOnThreads: body.runOnThreads ?? undefined,
          actions: body.actions
            ? {
                createMany: {
                  data: body.actions.map(
                    ({ type, label, subject, content, to, cc, bcc }) => {
                      return {
                        type,
                        ...(label?.ai
                          ? { label: null, labelPrompt: label?.value }
                          : { label: label?.value, labelPrompt: null }),
                        ...(subject?.ai
                          ? { subject: null, subjectPrompt: subject?.value }
                          : { subject: subject?.value, subjectPrompt: null }),
                        ...(content?.ai
                          ? { content: null, contentPrompt: content?.value }
                          : { content: content?.value, contentPrompt: null }),
                        ...(to?.ai
                          ? { to: null, toPrompt: to?.value }
                          : { to: to?.value, toPrompt: null }),
                        ...(cc?.ai
                          ? { cc: null, ccPrompt: cc?.value }
                          : { cc: cc?.value, ccPrompt: null }),
                        ...(bcc?.ai
                          ? { bcc: null, bccPrompt: bcc?.value }
                          : { bcc: bcc?.value, bccPrompt: null }),
                      };
                    },
                  ),
                },
              }
            : undefined,
          userId: session.user.id,
          from: body.from || undefined,
          to: body.to || undefined,
          subject: body.subject || undefined,
          // body: body.body || undefined,
          groupId: body.groupId || undefined,
          categoryFilterType: body.categoryFilterType || undefined,
          categoryFilters: !body.categoryFilterType
            ? {}
            : body.categoryFilters
              ? {
                  connect: body.categoryFilters.map((id) => ({ id })),
                }
              : undefined,
        },
      });

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

    try {
      const currentRule = await prisma.rule.findUnique({
        where: { id: body.id, userId: session.user.id },
        include: { actions: true, categoryFilters: true },
      });
      if (!currentRule) return { error: "Rule not found" };

      const currentActions = currentRule.actions;

      const actionsToDelete = currentActions.filter(
        (currentAction) => !body.actions.find((a) => a.id === currentAction.id),
      );
      const actionsToUpdate = body.actions.filter((a) => a.id);
      const actionsToCreate = body.actions.filter((a) => !a.id);

      const [rule] = await prisma.$transaction([
        // update rule
        prisma.rule.update({
          where: { id: body.id, userId: session.user.id },
          data: {
            type: body.type,
            instructions: body.instructions || "",
            automate: body.automate ?? undefined,
            runOnThreads: body.runOnThreads ?? undefined,
            name: body.name || undefined,
            from: body.from,
            to: body.to,
            subject: body.subject,
            // body: body.body,
            groupId: body.groupId,
            categoryFilterType: body.categoryFilterType || undefined,
            categoryFilters:
              body.categoryFilterType === null
                ? { set: [] }
                : body.categoryFilters
                  ? {
                      set: body.categoryFilters.map((id) => ({ id })),
                    }
                  : undefined,
          },
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
            data: {
              type: a.type,
              ...(a.label?.ai
                ? { label: null, labelPrompt: a.label?.value }
                : { label: a.label?.value, labelPrompt: null }),
              ...(a.subject?.ai
                ? { subject: null, subjectPrompt: a.subject?.value }
                : { subject: a.subject?.value, subjectPrompt: null }),
              ...(a.content?.ai
                ? { content: null, contentPrompt: a.content?.value }
                : { content: a.content?.value, contentPrompt: null }),
              ...(a.to?.ai
                ? { to: null, toPrompt: a.to?.value }
                : { to: a.to?.value, toPrompt: null }),
              ...(a.cc?.ai
                ? { cc: null, ccPrompt: a.cc?.value }
                : { cc: a.cc?.value, ccPrompt: null }),
              ...(a.bcc?.ai
                ? { bcc: null, bccPrompt: a.bcc?.value }
                : { bcc: a.bcc?.value, bccPrompt: null }),
            },
          });
        }),
        // create new actions
        ...(actionsToCreate.length
          ? [
              prisma.action.createMany({
                data: actionsToCreate.map((a) => ({
                  ruleId: body.id,
                  type: a.type,
                  ...(a.label?.ai
                    ? { label: null, labelPrompt: a.label?.value }
                    : { label: a.label?.value, labelPrompt: null }),
                  ...(a.subject?.ai
                    ? { subject: null, subjectPrompt: a.subject?.value }
                    : { subject: a.subject?.value, subjectPrompt: null }),
                  ...(a.content?.ai
                    ? { content: null, contentPrompt: a.content?.value }
                    : { content: a.content?.value, contentPrompt: null }),
                  ...(a.to?.ai
                    ? { to: null, toPrompt: a.to?.value }
                    : { to: a.to?.value, toPrompt: null }),
                  ...(a.cc?.ai
                    ? { cc: null, ccPrompt: a.cc?.value }
                    : { cc: a.cc?.value, ccPrompt: null }),
                  ...(a.bcc?.ai
                    ? { bcc: null, bccPrompt: a.bcc?.value }
                    : { bcc: a.bcc?.value, bccPrompt: null }),
                })),
              }),
            ]
          : []),
      ]);

      revalidatePath(`/automation/rule/${body.id}`);

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
      return { error: "Error updating rule." };
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
