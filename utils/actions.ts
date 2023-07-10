"use server";

import { openai } from "@/app/api/ai/openai";
import { filterFunctions } from "@/utils/filters";
import { ChatCompletionResponse } from "@/utils/types";
import { type PromptQuery } from "@/app/api/ai/prompt/route";
import { ChatCompletionRequestMessageFunctionCall } from "openai-edge";
import { createLabel } from "@/app/api/google/labels/create/route";
import { labelThread } from "@/app/api/google/threads/label/route";

export async function createFilterFromPrompt(body: PromptQuery) {
  const response = await openai.createChatCompletion({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: `You are an AI assistant to help people manage their emails. Valid labels are ${body.labels}`,
      },
      {
        role: "user",
        content: `Choose the filter function to call on the following prompt and you will then receive the filtered emails:\n\n###\n\n${body.message}`,
      },
    ],
    functions: filterFunctions,
    function_call: "auto",
  });

  const json: ChatCompletionResponse = await response.json();

  const filter = json?.choices?.[0]?.message
    .function_call as ChatCompletionRequestMessageFunctionCall;

  return { filter };
}

export async function createLabelAction(name: string) {
  await createLabel({ name });
}

export async function labelThreadsAction(options: {
  labelId: string;
  threadIds: string[];
  archive: boolean;
}) {
  return await Promise.all(
    options.threadIds.map((threadId) => {
      labelThread({
        labelId: options.labelId,
        threadId,
        archive: options.archive,
      });
    })
  );
}
