"use server";

import { createLabel } from "@/app/api/google/labels/create/controller";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import type { Label } from "@prisma/client";
import { saveUserLabels } from "@/utils/redis/label";
import { trashMessage, trashThread } from "@/utils/gmail/trash";
import {
  archiveThread,
  markImportantMessage,
  markReadThread,
} from "@/utils/gmail/label";
import { markSpam } from "@/utils/gmail/spam";
import {
  createAutoArchiveFilter,
  createFilter,
  deleteFilter,
} from "@/utils/gmail/filter";
import type { ServerActionResponse } from "@/utils/error";
import type { gmail_v1 } from "@googleapis/gmail";
import {
  getSessionAndGmailClient,
  isStatusOk,
  handleError,
} from "@/utils/actions/helpers";

async function executeGmailAction<T>(
  actionName: string,
  action: (
    gmail: gmail_v1.Gmail,
    user: { id: string; email: string },
  ) => Promise<any>,
  errorMessage: string,
  onError?: (error: unknown) => boolean, // returns true if error was handled
): Promise<ServerActionResponse<T>> {
  const { gmail, user, error } = await getSessionAndGmailClient();
  if (error) return { error };
  if (!gmail) return { error: "Could not load Gmail" };

  try {
    const res = await action(gmail, user);
    return !isStatusOk(res.status)
      ? handleError(actionName, res, errorMessage, user.email)
      : undefined;
  } catch (error) {
    if (onError?.(error)) return;
    return handleError(actionName, error, errorMessage, user.email);
  }
}

export async function archiveThreadAction(
  threadId: string,
): Promise<ServerActionResponse> {
  return executeGmailAction(
    "archiveThread",
    async (gmail, user) =>
      archiveThread({
        gmail,
        threadId,
        ownerEmail: user.email,
        actionSource: "user",
      }),
    "Failed to archive thread",
  );
}

export async function trashThreadAction(
  threadId: string,
): Promise<ServerActionResponse> {
  return executeGmailAction(
    "trashThread",
    async (gmail, user) =>
      trashThread({
        gmail,
        threadId,
        ownerEmail: user.email,
        actionSource: "user",
      }),
    "Failed to delete thread",
  );
}

export async function trashMessageAction(
  messageId: string,
): Promise<ServerActionResponse> {
  return executeGmailAction(
    "trashMessage",
    async (gmail) => trashMessage({ gmail, messageId }),
    "Failed to delete message",
  );
}

export async function markReadThreadAction(
  threadId: string,
  read: boolean,
): Promise<ServerActionResponse> {
  return executeGmailAction(
    "markReadThread",
    async (gmail) => markReadThread({ gmail, threadId, read }),
    "Failed to mark thread as read",
  );
}

export async function markImportantMessageAction(
  messageId: string,
  important: boolean,
): Promise<ServerActionResponse> {
  return executeGmailAction(
    "markImportantMessage",
    async (gmail) => markImportantMessage({ gmail, messageId, important }),
    "Failed to mark message as important",
  );
}

export async function markSpamThreadAction(
  threadId: string,
): Promise<ServerActionResponse> {
  return executeGmailAction(
    "markSpamThread",
    async (gmail) => markSpam({ gmail, threadId }),
    "Failed to mark thread as spam",
  );
}

export async function createAutoArchiveFilterAction(
  from: string,
  gmailLabelId?: string,
): Promise<ServerActionResponse> {
  return executeGmailAction(
    "createAutoArchiveFilter",
    async (gmail) => createAutoArchiveFilter({ gmail, from, gmailLabelId }),
    "Failed to create auto archive filter",
    (error) => {
      const errorMessage = (error as any)?.errors?.[0]?.message;
      if (errorMessage === "Filter already exists") return true;
      return false;
    },
  );
}

export async function createFilterAction(
  from: string,
  gmailLabelId: string,
): Promise<ServerActionResponse> {
  return executeGmailAction(
    "createFilter",
    async (gmail) => createFilter({ gmail, from, addLabelIds: [gmailLabelId] }),
    "Failed to create filter",
  );
}

export async function deleteFilterAction(
  id: string,
): Promise<ServerActionResponse> {
  return executeGmailAction(
    "deleteFilter",
    async (gmail) => deleteFilter({ gmail, id }),
    "Failed to delete filter",
  );
}

export async function createLabelAction(options: {
  name: string;
  description?: string;
}): Promise<ServerActionResponse> {
  try {
    const label = await createLabel(options);
    return label;
  } catch (error: any) {
    return { error: error.message };
  }
}

export async function updateLabelsAction(
  labels: Pick<Label, "name" | "description" | "enabled" | "gmailLabelId">[],
): Promise<ServerActionResponse> {
  const session = await auth();
  if (!session?.user.email) return { error: "Not logged in" };

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
