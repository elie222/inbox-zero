import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { getOpenAI } from "@/utils/llms/openai";

export type OpenAiModelsResponse = Awaited<ReturnType<typeof getOpenAiModels>>;

async function getOpenAiModels({ apiKey }: { apiKey: string }) {
  const openai = getOpenAI(apiKey);

  const models = await openai.models.list();

  return models.data.filter((m) => m.id.startsWith("gpt-"));
}

export const GET = withError(async () => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const user = await prisma.user.findUniqueOrThrow({
    where: { email: session.user.email },
    select: { openAIApiKey: true },
  });

  if (!user.openAIApiKey) return NextResponse.json([]);

  const result = await getOpenAiModels({ apiKey: user.openAIApiKey });

  return NextResponse.json(result);
});
