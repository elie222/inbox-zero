import { z } from "zod";
import { env } from "@/env.mjs";
import { OpenAI } from "openai";
import {
  ChatCompletionCreateParams,
  ChatCompletionTool,
} from "openai/resources";

const openAIs: Record<string, OpenAI> = {};

export function getOpenAI(apiKey: string | null) {
  const key = apiKey || env.OPENAI_API_KEY;

  if (openAIs[key]) return openAIs[key];

  openAIs[key] = new OpenAI({ apiKey: key });

  return openAIs[key];
}

// model must support response_type: json_object
export const zodAIModel = z.enum(["gpt-3.5-turbo-1106", "gpt-4-1106-preview"]);
export type AIModel = z.infer<typeof zodAIModel>;

export type UserAIFields = {
  aiModel: AIModel | null;
  openAIApiKey: string | null;
};

export function functionsToTools(
  functions: ChatCompletionCreateParams.Function[],
): ChatCompletionTool[] {
  return functions.map((f) => ({
    function: f,
    type: "function",
  }));
}
