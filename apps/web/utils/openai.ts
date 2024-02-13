import { z } from "zod";
import { OpenAI } from "openai";
import { env } from "@/env.mjs";

const openAIs: Record<string, OpenAI> = {};

export function getOpenAI(apiKey: string | null) {
  const key = apiKey || env.OPENAI_API_KEY;

  if (openAIs[key]) return openAIs[key];

  openAIs[key] = new OpenAI({ apiKey: key });

  return openAIs[key];
}

// model must support response_type: json_object
export const zodAIModel = z.enum(["gpt-3.5-turbo-1106", "gpt-4-turbo-preview"]);
export type AIModel = z.infer<typeof zodAIModel>;

// beware of rate limits for different models
export const DEFAULT_AI_MODEL: AIModel = "gpt-3.5-turbo-1106";

export function getAiModel(model: string | null): AIModel {
  if (model?.startsWith("gpt-4")) return "gpt-4-turbo-preview";
  return DEFAULT_AI_MODEL;
}

export type UserAIFields = {
  aiModel: AIModel | null;
  openAIApiKey: string | null;
};
