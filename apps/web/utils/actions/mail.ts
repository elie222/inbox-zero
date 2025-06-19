"use server";

import { z } from "zod";
import { createLabel } from "@/app/api/google/labels/create/controller";
import prisma from "@/utils/prisma";
import { saveUserLabels } from "@/utils/redis/label";
import { trashThread } from "@/utils/gmail/trash";
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
import { sendEmailWithHtml, sendEmailBody } from "@/utils/gmail/mail";
import { actionClient } from "@/utils/actions/safe-action";
import { getGmailClientForEmail } from "@/utils/account";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";

// do not return functions to the client or we'll get an error
const isStatusOk = (status: number) => status >= 200 && status < 300;

export const archiveThreadAction = actionClient
  .metadata({ name: "archiveThread" })
  .schema(z.object({ threadId: z.string(), labelId: z.string().optional() }))
  .action(
    async ({
      ctx: { emailAccountId, emailAccount },
      parsedInput: { threadId, labelId },
    }) => {
      const gmail = await getGmailClientForEmail({ emailAccountId });

      const res = await archiveThread({
        gmail,
        threadId,
        ownerEmail: emailAccount.email,
        actionSource: "user",
        labelId,
      });

      if (!isStatusOk(res.status))
        throw new SafeError("Failed to archive thread");
    },
  );

export const trashThreadAction = actionClient
  .metadata({ name: "trashThread" })
  .schema(z.object({ threadId: z.string() }))
  .action(
    async ({
      ctx: { emailAccountId, emailAccount },
      parsedInput: { threadId },
    }) => {
      const gmail = await getGmailClientForEmail({ emailAccountId });

      const res = await trashThread({
        gmail,
        threadId,
        ownerEmail: emailAccount.email,
        actionSource: "user",
      });

      if (!isStatusOk(res.status))
        throw new SafeError("Failed to delete thread");
    },
  );

// export const trashMessageAction = actionClient
//   .metadata({ name: "trashMessage" })
//   .schema(z.object({ messageId: z.string() }))
//   .action(async ({ ctx: { emailAccountId }, parsedInput: { messageId } }) => {
//     const gmail = await getGmailClientForEmail({ emailAccountId });

//     const res = await trashMessage({ gmail, messageId });

//     if (!isStatusOk(res.status)) throw new SafeError("Failed to delete message");
//   });

export const markReadThreadAction = actionClient
  .metadata({ name: "markReadThread" })
  .schema(z.object({ threadId: z.string(), read: z.boolean() }))
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { threadId, read } }) => {
      const gmail = await getGmailClientForEmail({ emailAccountId });

      const res = await markReadThread({ gmail, threadId, read });

      if (!isStatusOk(res.status))
        throw new SafeError("Failed to mark thread as read");
    },
  );

export const markImportantMessageAction = actionClient
  .metadata({ name: "markImportantMessage" })
  .schema(z.object({ messageId: z.string(), important: z.boolean() }))
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { messageId, important },
    }) => {
      const gmail = await getGmailClientForEmail({ emailAccountId });

      const res = await markImportantMessage({ gmail, messageId, important });

      if (!isStatusOk(res.status))
        throw new SafeError("Failed to mark message as important");
    },
  );

export const markSpamThreadAction = actionClient
  .metadata({ name: "markSpamThread" })
  .schema(z.object({ threadId: z.string() }))
  .action(async ({ ctx: { emailAccountId }, parsedInput: { threadId } }) => {
    const gmail = await getGmailClientForEmail({ emailAccountId });

    const res = await markSpam({ gmail, threadId });

    if (!isStatusOk(res.status))
      throw new SafeError("Failed to mark thread as spam");
  });

export const createAutoArchiveFilterAction = actionClient
  .metadata({ name: "createAutoArchiveFilter" })
  .schema(z.object({ from: z.string(), gmailLabelId: z.string().optional() }))
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { from, gmailLabelId },
    }) => {
      const gmail = await getGmailClientForEmail({ emailAccountId });

      const res = await createAutoArchiveFilter({ gmail, from, gmailLabelId });

      if (!isStatusOk(res.status))
        throw new SafeError("Failed to create auto archive filter");
    },
  );

export const createFilterAction = actionClient
  .metadata({ name: "createFilter" })
  .schema(z.object({ from: z.string(), gmailLabelId: z.string() }))
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { from, gmailLabelId },
    }) => {
      const gmail = await getGmailClientForEmail({ emailAccountId });

      const res = await createFilter({
        gmail,
        from,
        addLabelIds: [gmailLabelId],
      });

      if (!isStatusOk(res.status))
        throw new SafeError("Failed to create filter");

      return res;
    },
  );

export const deleteFilterAction = actionClient
  .metadata({ name: "deleteFilter" })
  .schema(z.object({ id: z.string() }))
  .action(async ({ ctx: { emailAccountId }, parsedInput: { id } }) => {
    const gmail = await getGmailClientForEmail({ emailAccountId });

    const res = await deleteFilter({ gmail, id });

    if (!isStatusOk(res.status)) throw new SafeError("Failed to delete filter");
  });

export const createLabelAction = actionClient
  .metadata({ name: "createLabel" })
  .schema(z.object({ name: z.string(), description: z.string().optional() }))
  .action(
    async ({
      ctx: { emailAccountId, provider },
      parsedInput: { name, description },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
      });
      const label = await emailProvider.createLabel(name, description);
      return label;
    },
  );

export const updateLabelsAction = actionClient
  .metadata({ name: "updateLabels" })
  .schema(
    z.object({
      labels: z.array(
        z.object({
          name: z.string(),
          description: z.string().optional(),
          enabled: z.boolean(),
          gmailLabelId: z.string(),
        }),
      ),
    }),
  )
  .action(async ({ ctx: { emailAccountId }, parsedInput: { labels } }) => {
    const enabledLabels = labels.filter((label) => label.enabled);
    const disabledLabels = labels.filter((label) => !label.enabled);

    await prisma.$transaction([
      ...enabledLabels.map((label) => {
        const { name, description, enabled, gmailLabelId } = label;

        return prisma.label.upsert({
          where: { name_emailAccountId: { name, emailAccountId } },
          create: {
            gmailLabelId,
            name,
            description,
            enabled,
            emailAccountId,
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
          emailAccountId,
          name: { in: disabledLabels.map((label) => label.name) },
        },
      }),
    ]);

    await saveUserLabels({
      emailAccountId,
      labels: enabledLabels.map((l) => ({
        ...l,
        id: l.gmailLabelId,
      })),
    });
  });

export const sendEmailAction = actionClient
  .metadata({ name: "sendEmail" })
  .schema(sendEmailBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    const gmail = await getGmailClientForEmail({ emailAccountId });

    const result = await sendEmailWithHtml(gmail, parsedInput);

    return {
      success: true,
      messageId: result.data.id,
      threadId: result.data.threadId,
    };
  });
