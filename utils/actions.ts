"use server";

import { openai } from "@/app/api/ai/openai";
import { z } from "zod";
import { filterFunctions } from "@/utils/filters";
import { type ChatCompletionRequestMessageFunctionCall } from "openai-edge";
import {
  ChatCompletionError,
  ChatCompletionResponse,
  isChatCompletionError,
} from "@/utils/types";
import { type PromptQuery } from "@/app/api/ai/prompt/route";
import { createLabel } from "@/app/api/google/labels/create/route";
import { labelThread } from "@/app/api/google/threads/label/route";
import prisma from "@/utils/prisma";
import { getSession } from "@/utils/auth";
import { Label } from "@prisma/client";
import { deletePromptHistory } from "@/app/api/prompt-history/route";
import { archiveEmail } from "@/app/api/google/threads/archive/route";

export async function createFilterFromPrompt(body: PromptQuery) {
  const session = await getSession();
  if (!session?.user) throw new Error("Not logged in");

  const responsePromise = openai.createChatCompletion({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: `You are an AI assistant to help people manage their emails. Valid labels are: ${body.labels.join(
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

const saveAboutBody = z.object({
  about: z.string(),
});
export type SaveAboutBody = z.infer<typeof saveAboutBody>;

export async function saveAboutAction(options: { about: string }) {
  const session = await getSession();
  if (!session?.user) throw new Error("Not logged in");

  await prisma.user.update({
    where: { email: session.user.email },
    data: { about: options.about },
  });
}

export async function deleteAccountAction() {
  const session = await getSession();
  if (!session?.user) throw new Error("Not logged in");

  await prisma.user.delete({
    where: { email: session.user.email },
  });
}

export async function updateLabels(
  labels: Pick<Label, "name" | "description" | "enabled" | "gmailLabelId">[]
) {
  const session = await getSession();
  if (!session?.user) throw new Error("Not logged in");

  const userId = session.user.id;

  const enabledLabels = labels.filter((label) => label.enabled);
  const disabledLabels = labels.filter((label) => !label.enabled);

  await prisma.$transaction([
    ...enabledLabels.map((label) => {
      const { name, description, enabled, gmailLabelId } = label;

      return prisma.label.upsert({
        where: { name_userId: { name, userId } },
        create: {
          gmailLabelId,
          name,
          description,
          enabled,
          user: { connect: { id: userId } },
        },
        update: {
          name,
          description,
          enabled,
        },
      });
    }),
    prisma.label.deleteMany({
      where: {
        userId,
        name: { in: disabledLabels.map((label) => label.name) },
      },
    }),
  ]);
}

export async function deletePromptHistoryAction(options: { id: string }) {
  const session = await getSession();
  if (!session) throw new Error("Not logged in");

  return deletePromptHistory({ id: options.id, userId: session.user.id });
}

// export async function archiveAction(options: { threadId: string }) {
//   return await archiveEmail({ id: options.threadId });
// }
