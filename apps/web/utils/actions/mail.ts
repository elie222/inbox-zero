"use server";

import { z } from "zod";
import prisma from "@/utils/prisma";
import { sendEmailBody } from "@/utils/gmail/mail";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";

// do not return functions to the client or we'll get an error
const isStatusOk = (status: number) => status >= 200 && status < 300;

export const archiveThreadAction = actionClient
  .metadata({ name: "archiveThread" })
  .schema(z.object({ threadId: z.string(), labelId: z.string().optional() }))
  .action(
    async ({
      ctx: { emailAccountId, emailAccount, provider },
      parsedInput: { threadId, labelId },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
      });

      await emailProvider.archiveThreadWithLabel(
        threadId,
        emailAccount.email,
        labelId,
      );
    },
  );

export const trashThreadAction = actionClient
  .metadata({ name: "trashThread" })
  .schema(z.object({ threadId: z.string() }))
  .action(
    async ({
      ctx: { emailAccountId, emailAccount, provider },
      parsedInput: { threadId },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
      });

      await emailProvider.trashThread(threadId, emailAccount.email, "user");
    },
  );

export const markReadThreadAction = actionClient
  .metadata({ name: "markReadThread" })
  .schema(z.object({ threadId: z.string(), read: z.boolean() }))
  .action(
    async ({
      ctx: { emailAccountId, provider },
      parsedInput: { threadId, read },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
      });

      await emailProvider.markReadThread(threadId, read);
    },
  );

export const createAutoArchiveFilterAction = actionClient
  .metadata({ name: "createAutoArchiveFilter" })
  .schema(
    z.object({
      from: z.string(),
      gmailLabelId: z.string().optional(),
      labelName: z.string().optional(),
    }),
  )
  .action(
    async ({
      ctx: { emailAccountId, provider },
      parsedInput: { from, gmailLabelId, labelName },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
      });

      await emailProvider.createAutoArchiveFilter({
        from,
        gmailLabelId,
        labelName,
      });
    },
  );

export const createFilterAction = actionClient
  .metadata({ name: "createFilter" })
  .schema(z.object({ from: z.string(), gmailLabelId: z.string() }))
  .action(
    async ({
      ctx: { emailAccountId, provider },
      parsedInput: { from, gmailLabelId },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
      });

      const res = await emailProvider.createFilter({
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
  .action(
    async ({ ctx: { emailAccountId, provider }, parsedInput: { id } }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
      });

      const res = await emailProvider.deleteFilter(id);

      if (!isStatusOk(res.status))
        throw new SafeError("Failed to delete filter");
    },
  );

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
  });

export const sendEmailAction = actionClient
  .metadata({ name: "sendEmail" })
  .schema(sendEmailBody)
  .action(async ({ ctx: { emailAccountId, provider }, parsedInput }) => {
    const emailProvider = await createEmailProvider({
      emailAccountId,
      provider,
    });

    const result = await emailProvider.sendEmailWithHtml(parsedInput);

    return {
      success: true,
      messageId: result.messageId,
      threadId: result.threadId,
    };
  });
