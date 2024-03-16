import { z } from "zod";
import { OpenAI } from "openai";
import { env } from "@/env.mjs";
import { ChatCompletionCreateParams } from "openai/resources/index";

const openAIs: Record<string, OpenAI> = {};

export function getOpenAI(apiKey: string | null) {
  const key = apiKey || env.OPENAI_API_KEY;

  if (openAIs[key]) return openAIs[key];

  openAIs[key] = new OpenAI({ apiKey: key });

  return openAIs[key];
}

// model must support response_type: json_object
export const zodAIModel = z.enum(["gpt-3.5-turbo-1106", "gpt-4-turbo-preview"]);
// export type AIModel = z.infer<typeof zodAIModel>;

// beware of rate limits for different models
export const DEFAULT_AI_MODEL = "gpt-4-turbo-preview";

export function getAiModel(model: string | null): string {
  return model || DEFAULT_AI_MODEL;
}

export type UserAIFields = {
  aiModel: string | null;
  openAIApiKey: string | null;
};

export function jsonResponseFormat(model: string): {
  response_format?: ChatCompletionCreateParams.ResponseFormat;
} {
  const supportJsonResponse = [
    "gpt-3.5-turbo-0125",
    "gpt-3.5-turbo-1106",
    "gpt-3.5-turbo",
    "gpt-4-0125-preview",
    "gpt-4-1106-preview",
    "gpt-4-turbo-preview",
  ];

  if (supportJsonResponse.includes(model))
    return { response_format: { type: "json_object" } };

  return {};
}
