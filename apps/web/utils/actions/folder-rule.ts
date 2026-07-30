"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { describeError, SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import { ActionType } from "@/generated/prisma/enums";
import { createRule, deleteRule } from "@/utils/rule/rule";
import {
  autoReadRuleName,
  generateFolderInstructionsBody,
  setFolderAutoReadBody,
} from "@/utils/actions/folder-rule.validation";
import { createEmailProvider } from "@/utils/email/provider";
import { getEmailAccountWithAiAndTokens } from "@/utils/user/get";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { aiGenerateFolderInstructions } from "@/utils/ai/label/generate-folder-instructions";
import { isDefined } from "@/utils/types";

// Drafts filing instructions by reading what's already in the folder. Returns
// a draft for the user to review in the rule editor — nothing is saved here.
export const generateFolderInstructionsAction = actionClient
  .metadata({ name: "generateFolderInstructions" })
  .inputSchema(generateFolderInstructionsBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { labelId, labelName },
    }) => {
      const emailAccount = await getEmailAccountWithAiAndTokens({
        emailAccountId,
      });
      if (!emailAccount) throw new SafeError("Email account not found");

      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });

      const threads = await emailProvider.getThreadsWithLabel({
        labelId,
        maxResults: 15,
      });

      const emails = threads
        .map((thread) => thread.messages.at(-1))
        .filter(isDefined)
        .map((message) =>
          getEmailForLLM(message, { removeForwarded: true, maxLength: 1000 }),
        );

      if (!emails.length) {
        throw new SafeError(
          "This folder has no emails to learn from yet. Add some emails first or write instructions manually.",
        );
      }

      try {
        const result = await aiGenerateFolderInstructions({
          emailAccount,
          labelName,
          emails,
        });
        if (!result) throw new SafeError("Could not generate instructions");
        return result;
      } catch (error) {
        if (error instanceof SafeError) throw error;
        logger.error("Error generating folder instructions", { error });
        // Surface the underlying cause: without it, config problems (model,
        // key, quota) are indistinguishable from transient failures
        throw new SafeError(
          `Could not generate instructions from this folder: ${describeError(error)}`,
        );
      }
    },
  );

// Turns "mark mail in this folder as read" on or off.
//
// "all" is just a MARK_READ action on the folder's own filing rule. Scoped
// modes can't live there — narrowing that rule's conditions would narrow
// what gets filed too — so they get a companion rule that files into the
// same folder AND marks read, matching only ("only") or all but ("except")
// the listed senders. Its conditions are static, which the engine matches
// without asking the AI, so it wins over the broader filing rule.
export const setFolderAutoReadAction = actionClient
  .metadata({ name: "setFolderAutoRead" })
  .inputSchema(setFolderAutoReadBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { labelId, labelName, mode, senders },
    }) => {
      const companionName = autoReadRuleName(labelName);

      const filingRule = await prisma.rule.findFirst({
        where: {
          emailAccountId,
          organizationRuleId: null,
          name: { not: companionName },
          actions: {
            some: {
              OR: [
                {
                  type: ActionType.LABEL,
                  OR: [{ labelId }, { label: labelName }],
                },
                {
                  type: ActionType.MOVE_FOLDER,
                  OR: [{ folderId: labelId }, { folderName: labelName }],
                },
              ],
            },
          },
        },
        select: { id: true, actions: { select: { id: true, type: true } } },
        orderBy: [{ enabled: "desc" }, { createdAt: "asc" }],
      });

      const companion = await prisma.rule.findUnique({
        where: { name_emailAccountId: { name: companionName, emailAccountId } },
        select: { id: true },
      });

      // Only one of the two mechanisms is ever live, so every mode starts by
      // clearing the other
      const markReadActionId = filingRule?.actions.find(
        (action) => action.type === ActionType.MARK_READ,
      )?.id;

      if (mode === "all") {
        if (!filingRule) {
          throw new SafeError(
            "This folder has no filing rule yet — create one first.",
          );
        }
        if (!markReadActionId) {
          await prisma.action.create({
            data: {
              ruleId: filingRule.id,
              emailAccountId,
              type: ActionType.MARK_READ,
            },
          });
        }
      } else if (markReadActionId) {
        await prisma.action.delete({ where: { id: markReadActionId } });
      }

      if (mode === "only" || mode === "except") {
        const from = normalizeSenderPatterns(senders);
        if (companion) {
          await prisma.rule.update({
            where: { id: companion.id },
            data: { from, fromExclude: mode === "except", enabled: true },
          });
        } else {
          await createRule({
            result: {
              name: companionName,
              condition: {
                conditionalOperator: null,
                aiInstructions: null,
                static: { from, to: null, subject: null },
              },
              actions: [
                { type: ActionType.LABEL, fields: { label: labelName } },
                { type: ActionType.MARK_READ },
              ],
            },
            emailAccountId,
            provider,
            // Replies thread onto old conversations; without this the rule
            // skips any thread it hasn't run on before
            runOnThreads: true,
            staticExcludes: {
              fromExclude: mode === "except",
              toExclude: false,
              subjectExclude: false,
            },
            logger,
          });
        }
      } else if (companion) {
        await deleteRule({ emailAccountId, ruleId: companion.id });
      }

      logger.info("Updated folder auto-read", { labelId, mode });
    },
  );

// Accepts "someone@acme.com, @acme.com, acme.com" and stores the
// comma-separated form the static matcher reads
function normalizeSenderPatterns(senders: string | null | undefined) {
  return (senders ?? "")
    .split(/[|,\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}
