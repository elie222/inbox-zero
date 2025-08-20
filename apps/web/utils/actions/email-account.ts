"use server";

import { actionClient } from "@/utils/actions/safe-action";
import prisma from "@/utils/prisma";
import { aiAnalyzePersona } from "@/utils/ai/knowledge/persona";
import { createEmailProvider } from "@/utils/email/provider";
import { getEmailAccountWithAiAndTokens } from "@/utils/user/get";
import { SafeError } from "@/utils/error";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { z } from "zod";

export const updateEmailAccountRoleAction = actionClient
  .metadata({ name: "updateEmailAccountRole" })
  .schema(z.object({ role: z.string() }))
  .action(async ({ ctx: { emailAccountId }, parsedInput: { role } }) => {
    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { role },
    });
  });

export const analyzePersonaAction = actionClient
  .metadata({ name: "analyzePersona" })
  .action(async ({ ctx: { emailAccountId, provider } }) => {
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

const updateReferralSignatureSchema = z.object({ enabled: z.boolean() });

export const updateReferralSignatureAction = actionClient
  .metadata({ name: "updateReferralSignature" })
  .schema(updateReferralSignatureSchema)
  .action(async ({ ctx, parsedInput }) => {
    await prisma.emailAccount.update({
      where: { id: ctx.emailAccountId },
      data: { includeReferralSignature: parsedInput.enabled },
    });

    return { success: true };
  });
