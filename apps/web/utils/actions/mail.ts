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
import { getSessionAndGmailClient } from "@/utils/actions/helpers";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import { isActionError } from "@/utils/error";
import {
  sendEmailWithHtml,
  type SendEmailBody,
  sendEmailBody,
} from "@/utils/gmail/mail";

// do not return functions to the client or we'll get an error
const isStatusOk = (status: number) => status >= 200 && status < 300;

export const archiveThreadAction = withActionInstrumentation(
  "archiveThread",
  async (threadId: string, labelId?: string) => {
    const sessionResult = await getSessionAndGmailClient();
    if (isActionError(sessionResult)) return sessionResult;
    const { gmail, user } = sessionResult;

    const res = await archiveThread({
      gmail,
      threadId,
      ownerEmail: user.email,
      actionSource: "user",
      labelId,
    });

    if (!isStatusOk(res.status)) return { error: "Failed to archive thread" };
  },
);

export const trashThreadAction = withActionInstrumentation(
  "trashThread",
  async (threadId: string) => {
    const sessionResult = await getSessionAndGmailClient();
    if (isActionError(sessionResult)) return sessionResult;
    const { gmail, user } = sessionResult;

    const res = await trashThread({
      gmail,
      threadId,
      ownerEmail: user.email,
      actionSource: "user",
    });

    if (!isStatusOk(res.status)) return { error: "Failed to delete thread" };
  },
);

export const trashMessageAction = withActionInstrumentation(
  "trashMessage",
  async (messageId: string) => {
    const sessionResult = await getSessionAndGmailClient();
    if (isActionError(sessionResult)) return sessionResult;
    const { gmail } = sessionResult;

    const res = await trashMessage({ gmail, messageId });

    if (!isStatusOk(res.status)) return { error: "Failed to delete message" };
  },
);

export const markReadThreadAction = withActionInstrumentation(
  "markReadThread",
  async (threadId: string, read: boolean) => {
    const sessionResult = await getSessionAndGmailClient();
    if (isActionError(sessionResult)) return sessionResult;
    const { gmail } = sessionResult;

    const res = await markReadThread({ gmail, threadId, read });

    if (!isStatusOk(res.status))
      return { error: "Failed to mark thread as read" };
  },
);

export const markImportantMessageAction = withActionInstrumentation(
  "markImportantMessage",
  async (messageId: string, important: boolean) => {
    const sessionResult = await getSessionAndGmailClient();
    if (isActionError(sessionResult)) return sessionResult;
    const { gmail } = sessionResult;

    const res = await markImportantMessage({ gmail, messageId, important });

    if (!isStatusOk(res.status))
      return { error: "Failed to mark message as important" };
  },
);

export const markSpamThreadAction = withActionInstrumentation(
  "markSpamThread",
  async (threadId: string) => {
    const sessionResult = await getSessionAndGmailClient();
    if (isActionError(sessionResult)) return sessionResult;
    const { gmail } = sessionResult;

    const res = await markSpam({ gmail, threadId });

    if (!isStatusOk(res.status))
      return { error: "Failed to mark thread as spam" };
  },
);

export const createAutoArchiveFilterAction = withActionInstrumentation(
  "createAutoArchiveFilter",
  async (from: string, gmailLabelId?: string) => {
    const sessionResult = await getSessionAndGmailClient();
    if (isActionError(sessionResult)) return sessionResult;
    const { gmail } = sessionResult;

    const res = await createAutoArchiveFilter({ gmail, from, gmailLabelId });

    if (!isStatusOk(res.status))
      return { error: "Failed to create auto archive filter" };
  },
);

export const createFilterAction = withActionInstrumentation(
  "createFilter",
  async (from: string, gmailLabelId: string) => {
    const sessionResult = await getSessionAndGmailClient();
    if (isActionError(sessionResult)) return sessionResult;
    const { gmail } = sessionResult;

    const res = await createFilter({
      gmail,
      from,
      addLabelIds: [gmailLabelId],
    });

    if (!isStatusOk(res.status)) return { error: "Failed to create filter" };

    return res;
  },
);

export const deleteFilterAction = withActionInstrumentation(
  "deleteFilter",
  async (id: string) => {
    const sessionResult = await getSessionAndGmailClient();
    if (isActionError(sessionResult)) return sessionResult;
    const { gmail } = sessionResult;

    const res = await deleteFilter({ gmail, id });

    if (!isStatusOk(res.status)) return { error: "Failed to delete filter" };
  },
);

export const createLabelAction = withActionInstrumentation(
  "createLabel",
  async (options: { name: string; description?: string }) => {
    const label = await createLabel(options);
    return label;
  },
);

export const updateLabelsAction = withActionInstrumentation(
  "updateLabels",
  async (
    labels: Pick<Label, "name" | "description" | "enabled" | "gmailLabelId">[],
  ) => {
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
  },
);

export const sendEmailAction = withActionInstrumentation(
  "sendEmail",
  async (unsafeData: SendEmailBody) => {
    const sessionResult = await getSessionAndGmailClient();
    if (isActionError(sessionResult)) return sessionResult;
    const { gmail } = sessionResult;

    const body = sendEmailBody.parse(unsafeData);

    const result = await sendEmailWithHtml(gmail, body);

    return {
      success: true,
      messageId: result.data.id,
      threadId: result.data.threadId,
    };
  },
);
