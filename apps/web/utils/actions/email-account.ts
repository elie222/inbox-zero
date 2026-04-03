"use server";

import { after } from "next/server";
import { actionClient } from "@/utils/actions/safe-action";
import prisma from "@/utils/prisma";
import { aiAnalyzePersona } from "@/utils/ai/knowledge/persona";
import { createEmailProvider } from "@/utils/email/provider";
import { getEmailAccountWithAiAndTokens } from "@/utils/user/get";
import { SafeError } from "@/utils/error";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { updateContactRole } from "@inboxzero/loops";
import {
  updateHiddenAiDraftLinksBody,
  updateReferralSignatureBody,
} from "@/utils/actions/email-account.validation";
import { z } from "zod";

export const updateEmailAccountRoleAction = actionClient
  .metadata({ name: "updateEmailAccountRole" })
  .inputSchema(z.object({ role: z.string() }))
  .action(
    async ({
      ctx: { emailAccountId, userEmail, userId, logger },
      parsedInput: { role },
    }) => {
      after(async () => {
        await updateContactRole({
          email: userEmail,
          role,
        }).catch((error) => {
          logger.error("Loops: Error updating role", { error });
        });
      });

      await prisma.$transaction([
        prisma.emailAccount.update({
          where: { id: emailAccountId },
          data: { role },
        }),
        prisma.user.update({
          where: { id: userId },
          data: {
            onboardingAnswers: { answers: { role } },
            surveyRole: role,
          },
        }),
      ]);
    },
  );

export const analyzePersonaAction = actionClient
  .metadata({ name: "analyzePersona" })
  .action(async ({ ctx: { emailAccountId, provider, logger } }) => {
    const existingPersona = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { personaAnalysis: true },
    });

    if (existingPersona?.personaAnalysis) {
      return existingPersona.personaAnalysis;
    }

    const emailAccount = await getEmailAccountWithAiAndTokens({
      emailAccountId,
    });

    if (!emailAccount) {
      throw new SafeError("Email account not found");
    }

    const emailProvider = await createEmailProvider({
      emailAccountId,
      provider,
      logger,
    });

    const messagesResponse = await emailProvider.getMessagesWithPagination({
      maxResults: 200,
    });

    if (!messagesResponse.messages || messagesResponse.messages.length === 0) {
      throw new SafeError("No emails found for persona analysis");
    }

    const messages = messagesResponse.messages;

    const emails = messages.map((message) =>
      getEmailForLLM(message, { removeForwarded: true, maxLength: 2000 }),
    );

    const personaAnalysis = await aiAnalyzePersona({ emails, emailAccount });

    if (!personaAnalysis) {
      throw new SafeError("Failed to analyze persona");
    }

    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { personaAnalysis },
    });

    return personaAnalysis;
  });

export const updateReferralSignatureAction = actionClient
  .metadata({ name: "updateReferralSignature" })
  .inputSchema(updateReferralSignatureBody)
  .action(
    async ({ ctx: { emailAccountId, logger }, parsedInput: { enabled } }) => {
      logger.info("Updating referral signature", { enabled });

      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: { includeReferralSignature: enabled },
      });
    },
  );

export const updateHiddenAiDraftLinksAction = actionClient
  .metadata({ name: "updateHiddenAiDraftLinks" })
  .inputSchema(updateHiddenAiDraftLinksBody)
  .action(
    async ({ ctx: { emailAccountId, logger }, parsedInput: { enabled } }) => {
      logger.info("Updating hidden AI draft links", { enabled });

      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: { allowHiddenAiDraftLinks: enabled },
      });
    },
  );

export const fetchSignaturesFromProviderAction = actionClient
  .metadata({ name: "fetchSignaturesFromProvider" })
  .action(async ({ ctx: { emailAccountId, provider, logger } }) => {
    const emailProvider = await createEmailProvider({
      emailAccountId,
      provider,
      logger,
    });

    const signatures = await emailProvider.getSignatures();

    return { signatures };
  });
