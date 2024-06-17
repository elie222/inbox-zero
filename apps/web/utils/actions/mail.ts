"use server";

import { createLabel } from "@/app/api/google/labels/create/controller";
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
import { ServerActionResponse, captureException } from "@/utils/error";

export async function createLabelAction(options: {
  name: string;
  description?: string;
}) {
  try {
    const label = await createLabel(options);
    return label;
  } catch (error: any) {
    return { error: error.message };
  }
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
): Promise<ServerActionResponse> {
  const session = await auth();
  if (!session?.user.id) return { error: "Not logged in" };
  try {
    const gmail = getGmailClient(session);
    const res = await createAutoArchiveFilter({ gmail, from, gmailLabelId });

    if (isStatusOk(res.status)) {
      return { ok: true };
    } else {
      captureException(`Failed to create auto archive filter: ${res.status}`, {
        extra: res,
      });
      return { error: "Failed to create auto archive filter" };
    }
  } catch (error) {
    captureException(error);
    return { error: "Failed to create auto archive filter" };
  }
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
