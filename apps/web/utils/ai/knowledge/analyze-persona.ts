import "server-only";
import prisma from "@/utils/prisma";
import { scheduleAccountAnalysis } from "@/utils/ai/knowledge/schedule-account-analysis";
import { aiAnalyzePersona } from "@/utils/ai/knowledge/persona";
import { createEmailProvider } from "@/utils/email/provider";
import { getEmailAccountWithAiAndTokens } from "@/utils/user/get";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { SafeError } from "@/utils/error";
import type { Logger } from "@/utils/logger";

export async function schedulePersonaAnalysis({
  emailAccountId,
  provider,
  logger,
}: {
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) {
  const existing = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { personaAnalysis: true },
  });
  if (existing?.personaAnalysis) return { status: "completed" as const };

  return scheduleAccountAnalysis({
    emailAccountId,
    kind: "persona",
    logger,
    run: async (ownsLock) => {
      const emailAccount = await getEmailAccountWithAiAndTokens({
        emailAccountId,
      });
      if (!emailAccount) throw new SafeError("Email account not found");

      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });
      const { messages } = await emailProvider.getMessagesWithPagination({
        maxResults: 200,
      });
      if (!messages?.length) return false;

      const emails = messages.map((message) =>
        getEmailForLLM(message, { removeForwarded: true, maxLength: 2000 }),
      );
      const personaAnalysis = await aiAnalyzePersona({
        emails,
        emailAccount,
      });
      if (!personaAnalysis) return false;

      // An expired task must not overwrite a newer analysis or its lock.
      if (!(await ownsLock())) return false;
      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: { personaAnalysis },
      });
      return true;
    },
  });
}
