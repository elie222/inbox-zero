'use server';

import { openai } from "@/app/api/ai/openai";
import { filterFunctions } from "@/utils/filters";
import { ChatCompletionResponse } from "@/utils/types";
import { type PromptQuery } from "@/app/api/ai/prompt/route";
import { ChatCompletionRequestMessageFunctionCall } from "openai-edge";

export async function createFilterFromPrompt(body: PromptQuery) {
  const response = await openai.createChatCompletion({
    model: "gpt-4",
    messages: [{
      role: 'system',
      content: 'You are an AI assistant to help people manage their emails.',
    }, {
      role: 'user',
      content: `Choose the filter function to call on the following prompt and you will then receive the filtered emails:\n\n###\n\n${body.message}`,
    }],
    functions: filterFunctions,
    function_call: 'auto',
  });
  const json: ChatCompletionResponse = await response.json();

  const filter = json?.choices?.[0]?.message.function_call as ChatCompletionRequestMessageFunctionCall;

  return { filter };
}
