import { z } from "zod";
import { type ChatCompletionRequestMessageFunctionCall } from "openai-edge";
import { openai } from "@/utils/openai";
import { getAuthSession } from "@/utils/auth";
import { filterFunctions } from "@/utils/ai/filters";
import prisma from "@/utils/prisma";
import {
  ChatCompletionError,
  ChatCompletionResponse,
  isChatCompletionError,
} from "@/utils/types";
import { AI_MODEL } from "@/utils/config";

export const promptQuery = z.object({
  message: z.string(),
  labels: z.string().array(),
});
export type PromptQuery = z.infer<typeof promptQuery>;
export type PromptResponse = Awaited<ReturnType<typeof prompt>>;

export async function createFilterFromPrompt(body: PromptQuery) {
  const session = await getAuthSession();
  if (!session?.user) throw new Error("Not logged in");

  const responsePromise = openai.createChatCompletion({
    model: AI_MODEL,
    messages: [
      {
        role: "system",
        content: `You are an AI assistant that helps people manage their emails. Valid labels are: ${body.labels.join(
          ", "
        )}`,
      },
      {
        role: "user",
        content: `Choose the filter function to call on the following prompt and you will then receive the filtered emails:\n\n###\n\n${body.message}`,
      },
    ],
    functions: filterFunctions,
    function_call: "auto",
  });

  // save history in parallel to chat completion
  const promptHistoryPromise = prisma.promptHistory.create({
    data: {
      userId: session.user.id,
      prompt: body.message,
    },
  });

  const json: ChatCompletionResponse | ChatCompletionError = await (
    await responsePromise
  ).json();

  if (isChatCompletionError(json)) {
    console.error(json);

    return { filter: undefined };
  }

  const filter = json?.choices?.[0]?.message.function_call as
    | ChatCompletionRequestMessageFunctionCall
    | undefined;

  if (!filter) {
    console.log("Unable to create filter:", JSON.stringify(json, null, 2));
  }

  await promptHistoryPromise;

  return { filter };
}
