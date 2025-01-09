import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import {
  type SaveSettingsBody,
  saveSettingsBody,
} from "@/app/api/user/settings/validation";
import { Model, Provider } from "@/utils/llms/config";
import { SafeError } from "@/utils/error";

export type SaveSettingsResponse = Awaited<ReturnType<typeof saveAISettings>>;

async function saveAISettings(options: SaveSettingsBody) {
  const session = await auth();
  if (!session?.user.email) throw new SafeError("Not logged in");

  const aiProvider = options.aiProvider || Provider.ANTHROPIC;

  function getModel() {
    switch (aiProvider) {
      case Provider.OPEN_AI:
        return options.aiModel;
      case Provider.ANTHROPIC:
        if (options.aiApiKey) {
          // use anthropic if api key set
          return Model.CLAUDE_3_5_SONNET_ANTHROPIC;
        }
        // use bedrock if no api key set
        return Model.CLAUDE_3_5_SONNET_BEDROCK;
      case Provider.GOOGLE:
        return options.aiModel || Model.GEMINI_1_5_PRO;
      case Provider.OLLAMA:
        return Model.OLLAMA;
      default:
        throw new Error("Invalid AI provider");
    }
  }

  return await prisma.user.update({
    where: { email: session.user.email },
    data: {
      aiProvider,
      aiModel: getModel(),
      aiApiKey: options.aiApiKey || null,
    },
  });
}

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = saveSettingsBody.parse(json);

  const result = await saveAISettings(body);

  return NextResponse.json(result);
});
