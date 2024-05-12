"use server";

import { createLabel } from "@/app/api/google/labels/create/controller";
import { labelThread } from "@/app/api/google/threads/label/controller";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { type Label } from "@prisma/client";
import { saveUserLabels } from "@/utils/redis/label";
import { getGmailClient } from "@/utils/gmail/client";
import { trashMessage, trashThread } from "@/utils/gmail/trash";
import {
  archiveThread,
  markImportantMessage,
  markReadThread,
} from "@/utils/gmail/label";
import { markSpam } from "@/utils/gmail/spam";
import { isStatusOk } from "@/utils/actions/helpers";
import {
  createAutoArchiveFilter,
  createFilter,
  deleteFilter,
} from "@/utils/gmail/filter";

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
    }),
  );
}

export async function updateLabels(
  labels: Pick<Label, "name" | "description" | "enabled" | "gmailLabelId">[],
) {
  const session = await auth();
  if (!session?.user.email) throw new Error("Not logged in");

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

export async function archiveThreadAction(threadId: string) {
  const session = await auth();
  if (!session?.user.email) throw new Error("Not logged in");
  const gmail = getGmailClient(session);
  const res = await archiveThread({ gmail, threadId });
  return isStatusOk(res.status) ? { ok: true } : res;
}

export async function trashThreadAction(threadId: string) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");
  const gmail = getGmailClient(session);
  const res = await trashThread({ gmail, threadId });
  return isStatusOk(res.status) ? { ok: true } : res;
}
export async function trashMessageAction(messageId: string) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");
  const gmail = getGmailClient(session);
  const res = await trashMessage({ gmail, messageId });
  return isStatusOk(res.status) ? { ok: true } : res;
}

export async function markReadThreadAction(threadId: string, read: boolean) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");
  const gmail = getGmailClient(session);
  const res = await markReadThread({ gmail, threadId, read });
  return isStatusOk(res.status) ? { ok: true } : res;
}

export async function markImportantMessageAction(
  messageId: string,
  important: boolean,
) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");
  const gmail = getGmailClient(session);
  const res = await markImportantMessage({ gmail, messageId, important });
  return isStatusOk(res.status) ? { ok: true } : res;
}

export async function markSpamThreadAction(threadId: string) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");
  const gmail = getGmailClient(session);
  const res = await markSpam({ gmail, threadId });
  return isStatusOk(res.status) ? { ok: true } : res;
}

export async function createAutoArchiveFilterAction(
  from: string,
  gmailLabelId?: string,
) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");
  const gmail = getGmailClient(session);
  const res = await createAutoArchiveFilter({ gmail, from, gmailLabelId });
  return isStatusOk(res.status) ? { ok: true } : res;
}

export async function createFilterAction(from: string, gmailLabelId: string) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");
  const gmail = getGmailClient(session);
  try {
    const res = await createFilter({
      gmail,
      from,
      addLabelIds: [gmailLabelId],
    });
    return isStatusOk(res.status) ? { ok: true } : res;
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
}

export async function deleteFilterAction(id: string) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");
  const gmail = getGmailClient(session);
  const res = await deleteFilter({ gmail, id });
  return isStatusOk(res.status) ? { ok: true } : res;
}
