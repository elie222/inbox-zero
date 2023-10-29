"use server";

import { z } from "zod";
import {
  createFilterFromPrompt,
  type PromptQuery,
} from "@/app/api/ai/prompt/controller";
import { createLabel } from "@/app/api/google/labels/create/controller";
import { labelThread } from "@/app/api/google/threads/label/controller";
import { deletePromptHistory } from "@/app/api/user/prompt-history/controller";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { type Label } from "@prisma/client";
import {
  deleteInboxZeroLabels,
  deleteUserLabels,
  saveUserLabels,
} from "@/utils/redis/label";
import { deletePlans } from "@/utils/redis/plan";
import { deleteUserStats } from "@/utils/redis/stats";
import { deleteTinybirdEmails } from "@inboxzero/tinybird";

export async function createFilterFromPromptAction(body: PromptQuery) {
  return createFilterFromPrompt(body);
}

export async function createLabelAction(options: {
  name: string;
  description?: string;
}) {
  await createLabel(options);
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

// export async function archiveThreadAction(options: { threadId: string }) {
//   return await archiveEmail({ id: options.threadId })
// }

const saveAboutBody = z.object({
  about: z.string(),
});
export type SaveAboutBody = z.infer<typeof saveAboutBody>;

export async function saveAboutAction(options: SaveAboutBody) {
  const session = await auth();
  if (!session?.user) throw new Error("Not logged in");

  await prisma.user.update({
    where: { email: session.user.email },
    data: { about: options.about },
  });
}

export async function deleteAccountAction() {
  const session = await auth();
  if (!session?.user) throw new Error("Not logged in");

  await prisma.user.delete({
    where: { email: session.user.email },
  });

  await deleteUserLabels({ email: session.user.email });
  await deleteInboxZeroLabels({ email: session.user.email });
  await deletePlans({ userId: session.user.id });
  await deleteUserStats({ email: session.user.email });
  await deleteTinybirdEmails({ email: session.user.email });
}

export async function updateLabels(
  labels: Pick<Label, "name" | "description" | "enabled" | "gmailLabelId">[]
) {
  const session = await auth();
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

  await saveUserLabels({
    email: session.user.email,
    labels: enabledLabels.map((l) => ({
      ...l,
      id: l.gmailLabelId,
    })),
  });
}

export async function deletePromptHistoryAction(options: { id: string }) {
  const session = await auth();
  if (!session) throw new Error("Not logged in");

  return deletePromptHistory({ id: options.id, userId: session.user.id });
}
