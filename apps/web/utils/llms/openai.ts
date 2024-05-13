import { z } from "zod";
import { OpenAI } from "openai";
import { env } from "@/env.mjs";
import {
  ChatCompletionCreateParams,
  ChatCompletionTool,
} from "openai/resources/index";

export const DEFAULT_OPENAI_MODEL = "gpt-4o";

const openAIs: Record<string, OpenAI> = {};

export function getOpenAI(apiKey: string | null) {
  const key = apiKey || env.OPENAI_API_KEY;

  if (openAIs[key]) return openAIs[key];

  openAIs[key] = new OpenAI({ apiKey: key });

  return openAIs[key];
}

export const zodAIModel = z.enum(["gpt-3.5-turbo-0125", "gpt-4o"]);
// export type AIModel = z.infer<typeof zodAIModel>;

function jsonResponseFormat(model: string): {
  response_format?: ChatCompletionCreateParams.ResponseFormat;
} {
  const supportJsonResponse = [
    "gpt-3.5-turbo-0125",
    "gpt-3.5-turbo-1106",
    "gpt-3.5-turbo",
    "gpt-4-0125-preview",
    "gpt-4-1106-preview",
    "gpt-4-turbo-preview",
    "gpt-4-turbo-2024-04-09",
    "gpt-4-turbo",
    "gpt-4o",
  ];

  if (supportJsonResponse.includes(model))
    return { response_format: { type: "json_object" } };

  return {};
}

export async function openAIChatCompletion(
  model: string,
  apiKey: string | null,
  messages: Array<{
    role: "system" | "user";
    content: string;
  }>,
  options?: { jsonResponse?: boolean; tools?: Array<ChatCompletionTool> },
) {
  const openai = getOpenAI(apiKey);

  return openai.chat.completions.create({
    ...(options?.jsonResponse ? jsonResponseFormat(model) : {}),
    model,
    messages,
    temperature: 0,
    frequency_penalty: 0,
    presence_penalty: 0,
    tools: options?.tools,
  });
}

export async function openAIChatCompletionStream(
  model: string,
  apiKey: string | null,
  messages: Array<{
    role: "system" | "user";
    content: string;
  }>,
) {
  const openai = getOpenAI(apiKey);

  return openai.chat.completions.create({
    model,
    messages,
    temperature: 0,
    frequency_penalty: 0,
    presence_penalty: 0,
    stream: true,
  });
}
