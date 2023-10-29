import { z } from "zod";
import { getOpenAI } from "@/utils/openai";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { filterFunctions } from "@/utils/ai/filters";
import prisma from "@/utils/prisma";
import { DEFAULT_AI_MODEL } from "@/utils/config";

export const promptQuery = z.object({
  message: z.string(),
  labels: z.string().array(),
});
export type PromptQuery = z.infer<typeof promptQuery>;
export type PromptResponse = Awaited<ReturnType<typeof prompt>>;

export async function createFilterFromPrompt(body: PromptQuery) {
  const session = await auth();
  if (!session?.user) throw new Error("Not logged in");

  const aiResponsePromise = getOpenAI(null).chat.completions.create({
    model: DEFAULT_AI_MODEL,
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

  const aiResponse = await aiResponsePromise;
  const filter = aiResponse?.choices?.[0]?.message.function_call;

  if (!filter) {
    console.log("Unable to create filter:", aiResponse);
  }

  await promptHistoryPromise;

  return { filter };
}
