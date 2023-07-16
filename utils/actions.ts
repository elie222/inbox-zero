"use server";

import { z } from "zod";
import {
  createFilterFromPrompt,
  type PromptQuery,
} from "@/app/api/ai/prompt/controller";
import { createLabel } from "@/app/api/google/labels/create/controller";
import { labelThread } from "@/app/api/google/threads/label/controller";
import { deletePromptHistory } from "@/app/api/prompt-history/controller";
import { getSession } from "@/utils/auth";
import prisma from "@/utils/prisma";
import { Label } from "@prisma/client";

export async function createFilterFromPromptAction(body: PromptQuery) {
  return createFilterFromPrompt(body);
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
