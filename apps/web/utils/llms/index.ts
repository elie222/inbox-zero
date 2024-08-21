import type { z } from "zod";
import { type CoreTool, generateObject, generateText, streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { env } from "@/env";
import { saveAiUsage } from "@/utils/usage";
import { Model, Provider } from "@/utils/llms/config";
import { UserAIFields } from "@/utils/llms/types";

function getModel({ aiProvider, aiModel, aiApiKey: apiKey }: UserAIFields) {
  const provider = aiProvider || Provider.OPEN_AI;

  if (provider === Provider.OPEN_AI) {
    const model = aiModel || Model.GPT_4O;
    return {
      provider: Provider.OPEN_AI,
      model,
      llmModel: createOpenAI({ apiKey: apiKey || env.OPENAI_API_KEY })(model),
    };
  }

  if (provider === Provider.ANTHROPIC) {
    if (apiKey) {
      const model = aiModel || Model.CLAUDE_3_5_SONNET_ANTHROPIC;
      return {
        provider: Provider.ANTHROPIC,
        model,
        llmModel: createAnthropic({ apiKey })(model),
      };
    } else {
      if (!env.BEDROCK_ACCESS_KEY)
        throw new Error("BEDROCK_ACCESS_KEY is not set");
      if (!env.BEDROCK_SECRET_KEY)
        throw new Error("BEDROCK_SECRET_KEY is not set");

      const model = aiModel || Model.CLAUDE_3_5_SONNET_BEDROCK;
      return {
        provider: Provider.ANTHROPIC,
        model,
        llmModel: createAmazonBedrock({
          accessKeyId: env.BEDROCK_ACCESS_KEY,
          secretAccessKey: env.BEDROCK_SECRET_KEY,
          region: env.BEDROCK_REGION,
        })(model),
      };
    }
  }

  throw new Error("AI provider not supported");
}

export async function chatCompletionObject<T>({
  userAi,
  prompt,
  system,
  schema,
  userEmail,
  usageLabel,
}: {
  userAi: UserAIFields;
  prompt: string;
  system?: string;
  schema: z.Schema<T>;
  userEmail: string;
  usageLabel: string;
}) {
  const { provider, model, llmModel } = getModel(userAi);

  const result = await generateObject({
    model: llmModel,
    prompt,
    system,
    schema,
  });

  if (result.usage) {
    await saveAiUsage({
      email: userEmail,
      usage: result.usage,
      provider,
      model,
      label: usageLabel,
    });
  }

  return result;
}

export async function chatCompletionStream({
  userAi,
  prompt,
  system,
  userEmail,
  usageLabel: label,
  onFinish,
}: {
  userAi: UserAIFields;
  prompt: string;
  system?: string;
  userEmail: string;
  usageLabel: string;
  onFinish?: (text: string) => Promise<void>;
}) {
  const { provider, model, llmModel } = getModel(userAi);

  const result = await streamText({
    model: llmModel,
    prompt,
    system,
    onFinish: async ({ usage, text }) => {
      await saveAiUsage({
        email: userEmail,
        provider,
        model,
        usage,
        label,
      });

      if (onFinish) await onFinish(text);
    },
  });

  return result;
}

export async function chatCompletionTools({
  userAi,
  prompt,
  system,
  tools,
  label,
  userEmail,
}: {
  userAi: UserAIFields;
  prompt: string;
  system?: string;
  tools: Record<string, CoreTool>;
  label: string;
  userEmail: string;
}) {
  const { provider, model, llmModel } = getModel(userAi);

  const result = await generateText({
    model: llmModel,
    tools,
    toolChoice: "required",
    prompt,
    system,
  });

  if (result.usage) {
    await saveAiUsage({
      email: userEmail,
      usage: result.usage,
      provider,
      model,
      label,
    });
  }

  return result;
}
