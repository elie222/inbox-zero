import { NextResponse } from "next/server";
import OpenAI from "openai";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { Provider } from "@/utils/llms/config";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("api/ai/models");

export type OpenAiModelsResponse = Awaited<ReturnType<typeof getOpenAiModels>>;

async function getOpenAiModels({ apiKey }: { apiKey: string }) {
  const openai = new OpenAI({ apiKey });

  const models = await openai.models.list();

  return models.data;
}

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { user: { select: { aiApiKey: true, aiProvider: true } } },
  });

  if (
    !emailAccount ||
    !emailAccount.user.aiApiKey ||
    emailAccount.user.aiProvider !== Provider.OPEN_AI
  )
    return NextResponse.json([]);

  try {
    const result = await getOpenAiModels({
      apiKey: emailAccount.user.aiApiKey,
    });
    return NextResponse.json(result);
  } catch (error) {
    logger.error("Failed to get OpenAI models", { error });
    return NextResponse.json([]);
  }
});
