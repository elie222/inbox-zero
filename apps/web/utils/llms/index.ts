import type { z } from "zod";
import { type CoreTool, generateObject, generateText, streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { env } from "@/env.mjs";
import { saveAiUsage } from "@/utils/usage";

const DEFAULT_AI_PROVIDER = "openai";
const DEFAULT_OPENAI_MODEL = "gpt-4o";
const DEFAULT_ANTHROPIC_MODEL = "claude-3-haiku-20240307";

export function getAiProviderAndModel(
  provider: string | null,
  model: string | null,
): {
  provider: string;
  model: string;
} {
  if (provider === "anthropic") {
    return {
      provider,
      model: model || DEFAULT_ANTHROPIC_MODEL,
    };
  }

  return {
    provider: provider || DEFAULT_AI_PROVIDER,
    model: model || DEFAULT_OPENAI_MODEL,
  };
}

function getModel(provider: string, model: string, apiKey: string | null) {
  if (provider === "openai")
    return createOpenAI({ apiKey: apiKey || env.OPENAI_API_KEY })(model);
  if (provider === "anthropic")
    return createAnthropic({ apiKey: apiKey || env.ANTHROPIC_API_KEY })(model);

  throw new Error("AI provider not supported");
}

export async function chatCompletionObject<T>({
  provider,
  model,
  apiKey,
  prompt,
  system,
  schema,
  userEmail,
  usageLabel,
}: {
  provider: string;
  model: string;
  apiKey: string | null;
  prompt: string;
  system?: string;
  schema: z.Schema<T>;
  userEmail: string;
  usageLabel: string;
}) {
  const result = await generateObject({
    model: getModel(provider, model, apiKey),
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
  provider,
  model,
  apiKey,
  prompt,
  system,
  userEmail,
  usageLabel: label,
  onFinish,
}: {
  provider: string;
  model: string;
  apiKey: string | null;
  prompt: string;
  system?: string;
  userEmail: string;
  usageLabel: string;
  onFinish?: (text: string) => Promise<void>;
}) {
  const result = await streamText({
    model: getModel(provider, model, apiKey),
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
  provider,
  model,
  apiKey,
  prompt,
  system,
  tools,
  label,
  userEmail,
}: {
  provider: string;
  model: string;
  apiKey: string | null;
  prompt: string;
  system?: string;
  tools: Record<string, CoreTool>;
  label: string;
  userEmail: string;
}) {
  const result = await generateText({
    model: getModel(provider, model, apiKey),
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
