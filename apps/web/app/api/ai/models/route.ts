import { NextResponse } from "next/server";
import OpenAI from "openai";
import { withEmailAccount } from "@/utils/middleware";
import { Provider } from "@/utils/llms/config";
import { getEmailAccountWithAi } from "@/utils/user/get";

export type OpenAiModelsResponse = Awaited<ReturnType<typeof getOpenAiModels>>;

async function getOpenAiModels({ apiKey }: { apiKey: string }) {
  const openai = new OpenAI({ apiKey });

  const models = await openai.models.list();

  return models.data;
}

export const GET = withEmailAccount("api/ai/models", async (req) => {
  const { emailAccountId } = req.auth;

  const emailAccount = await getEmailAccountWithAi({ emailAccountId });

  if (
    !emailAccount?.user.aiApiKey ||
    emailAccount.user.aiProvider !== Provider.OPEN_AI
  )
    return NextResponse.json([]);

  try {
    const result = await getOpenAiModels({
      apiKey: emailAccount.user.aiApiKey,
    });
    return NextResponse.json(result);
  } catch (error) {
    req.logger.error("Failed to get OpenAI models", { error });
    return NextResponse.json([]);
  }
});
