import { NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { Provider } from "@/utils/llms/config";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("api/ai/models");

export type OpenAiModelsResponse = Awaited<ReturnType<typeof getOpenAiModels>>;

async function getOpenAiModels({ apiKey }: { apiKey: string }) {
  const openai = new OpenAI({ apiKey });

  const models = await openai.models.list();

  return models.data.filter((m) => m.id.startsWith("gpt-"));
}

export const GET = withError(async () => {
  const session = await auth();
  const email = session?.user.email;
  if (!email) return NextResponse.json({ error: "Not authenticated" });

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { email },
    select: { aiApiKey: true, aiProvider: true },
  });

  if (
    !emailAccount ||
    !emailAccount.aiApiKey ||
    emailAccount.aiProvider !== Provider.OPEN_AI
  )
    return NextResponse.json([]);

  try {
    const result = await getOpenAiModels({ apiKey: emailAccount.aiApiKey });
    return NextResponse.json(result);
  } catch (error) {
    logger.error("Failed to get OpenAI models", { error });
    return NextResponse.json([]);
  }
});
