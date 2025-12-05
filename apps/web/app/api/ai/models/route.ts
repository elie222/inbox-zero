import { NextResponse } from "next/server";
import OpenAI from "openai";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { Provider, allowUserAiProviderUrl } from "@/utils/llms/config";
import { normalizeOpenAiBaseUrl } from "@/utils/llms/model";

export type OpenAiModelsResponse = Awaited<ReturnType<typeof getOpenAiModels>>;

async function getOpenAiModels({
  apiKey,
  baseUrl,
}: {
  apiKey: string;
  baseUrl?: string | null;
}) {
  const baseURL = normalizeOpenAiBaseUrl(
    (allowUserAiProviderUrl && baseUrl) || env.OPENAI_BASE_URL,
  );

  const openai = new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
  });

  const models = await openai.models.list();

  return models.data;
}

export const GET = withEmailAccount("api/ai/models", async (req) => {
  const { emailAccountId } = req.auth;

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      user: { select: { aiApiKey: true, aiProvider: true, aiBaseUrl: true } },
    },
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
      baseUrl: emailAccount.user.aiBaseUrl,
    });
    return NextResponse.json(result);
  } catch (error) {
    req.logger.error("Failed to get OpenAI models", { error });
    return NextResponse.json([]);
  }
});
