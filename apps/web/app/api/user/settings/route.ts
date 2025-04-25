import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import {
  type SaveSettingsBody,
  saveSettingsBody,
} from "@/app/api/user/settings/validation";
import { Model, Provider } from "@/utils/llms/config";
import { SafeError } from "@/utils/error";
import { withAuth } from "@/utils/middleware";

export type SaveSettingsResponse = Awaited<ReturnType<typeof saveAISettings>>;

async function saveAISettings(
  { userId }: { userId: string },
  { aiProvider, aiModel, aiApiKey }: SaveSettingsBody,
) {
  function getModel() {
    switch (aiProvider) {
      case Provider.OPEN_AI:
        if (!aiApiKey) throw new SafeError("OpenAI API key is required");

        return aiModel;
      case Provider.ANTHROPIC:
        if (aiApiKey) {
          // use anthropic if api key set
          return Model.CLAUDE_3_7_SONNET_ANTHROPIC;
        }
        // use bedrock if no api key set
        return Model.CLAUDE_3_7_SONNET_BEDROCK;
      case Provider.GOOGLE:
        return aiModel || Model.GEMINI_2_0_FLASH;
      case Provider.GROQ:
        return aiModel || Model.GROQ_LLAMA_3_3_70B;
      case Provider.OPENROUTER:
        if (!aiApiKey) throw new SafeError("OpenRouter API key is required");
        return aiModel;
      case Provider.OLLAMA:
        return Model.OLLAMA;
      default:
        throw new Error("Invalid AI provider");
    }
  }

  return await prisma.user.update({
    where: { id: userId },
    data: {
      aiProvider,
      aiModel: getModel(),
      aiApiKey: aiApiKey || null,
    },
  });
}

export const POST = withAuth(async (request) => {
  const userId = request.auth.userId;

  const json = await request.json();
  const body = saveSettingsBody.parse(json);

  const result = await saveAISettings({ userId }, body);

  return NextResponse.json(result);
});
