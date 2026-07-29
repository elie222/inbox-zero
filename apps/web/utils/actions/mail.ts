"use server";

import { z } from "zod";
import prisma from "@/utils/prisma";
import { sendEmailBody } from "@/utils/gmail/mail";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";
import { ActionType } from "@/generated/prisma/enums";

const isStatusOk = (status: number) => status >= 200 && status < 300;

export const archiveThreadAction = actionClient
  .metadata({ name: "archiveThread" })
  .inputSchema(
    z.object({ threadId: z.string(), labelId: z.string().optional() }),
  )
  .action(
    async ({
      ctx: { emailAccountId, emailAccount, provider, logger },
      parsedInput: { threadId, labelId },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });

      try {
        await emailProvider.archiveThreadWithLabel(
          threadId,
          emailAccount.email,
          labelId,
        );
      } catch (error) {
        logger.error("Failed to archive thread", { error });
        throw new SafeError("Failed to archive email. Please try again.");
      }
    },
  );

export const trashThreadAction = actionClient
  .metadata({ name: "trashThread" })
  .inputSchema(z.object({ threadId: z.string() }))
  .action(
    async ({
      ctx: { emailAccountId, emailAccount, provider, logger },
      parsedInput: { threadId },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });

      try {
        await emailProvider.trashThread(threadId, emailAccount.email, "user");
      } catch (error) {
        logger.error("Failed to trash thread", { error });
        throw new SafeError("Failed to delete email. Please try again.");
      }
    },
  );

export const markReadThreadAction = actionClient
  .metadata({ name: "markReadThread" })
  .inputSchema(z.object({ threadId: z.string(), read: z.boolean() }))
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { threadId, read },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });

      try {
        await emailProvider.markReadThread(threadId, read);
      } catch (error) {
        logger.error("Failed to mark thread read state", { error });
        throw new SafeError(
          `Failed to mark email as ${read ? "read" : "unread"}. Please try again.`,
        );
      }
    },
  );

export const createAutoArchiveFilterAction = actionClient
  .metadata({ name: "createAutoArchiveFilter" })
  .inputSchema(
    z.object({
      from: z.string(),
      gmailLabelId: z.string().optional(),
      labelName: z.string().optional(),
    }),
  )
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { from, gmailLabelId, labelName },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
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
  .inputSchema(z.object({ from: z.string(), gmailLabelId: z.string() }))
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { from, gmailLabelId },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });

      const res = await emailProvider.createFilter({
        from,
        addLabelIds: [gmailLabelId],
      });

      if (!isStatusOk(res.status)) {
        logger.error("Failed to create filter", {
          from,
          gmailLabelId,
          status: res.status,
        });
        throw new SafeError("Failed to create filter");
      }
    },
  );

export const deleteFilterAction = actionClient
  .metadata({ name: "deleteFilter" })
  .inputSchema(z.object({ id: z.string() }))
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { id },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });

      const res = await emailProvider.deleteFilter(id);

      if (!isStatusOk(res.status)) {
        logger.error("Failed to delete filter", {
          filterId: id,
          status: res.status,
        });
        throw new SafeError("Failed to delete filter");
      }
    },
  );

export const createLabelAction = actionClient
  .metadata({ name: "createLabel" })
  .inputSchema(
    z.object({ name: z.string(), description: z.string().optional() }),
  )
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { name, description },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });
      const label = await emailProvider.createLabel(name, description);
      return label;
    },
  );

export const unarchiveThreadAction = actionClient
  .metadata({ name: "unarchiveThread" })
  .inputSchema(z.object({ threadId: z.string() }))
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { threadId },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });
      if (!emailProvider.unarchiveThread)
        throw new SafeError("Undo is not supported for this email provider");
      await emailProvider.unarchiveThread(threadId);
    },
  );

export const untrashThreadAction = actionClient
  .metadata({ name: "untrashThread" })
  .inputSchema(z.object({ threadId: z.string() }))
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { threadId },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });
      if (!emailProvider.untrashThread)
        throw new SafeError("Undo is not supported for this email provider");
      await emailProvider.untrashThread(threadId);
    },
  );

export const updateLabelAction = actionClient
  .metadata({ name: "updateLabel" })
  .inputSchema(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      enabled: z.boolean(),
      gmailLabelId: z.string(),
      icon: z.string().nullish(),
      color: z.string().max(50).nullish(),
    }),
  )
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { name, description, enabled, gmailLabelId, icon, color },
    }) => {
      // Unlike updateLabelsAction, disabling keeps the row (and its
      // description) so re-enabling doesn't start from scratch.
      await prisma.label.upsert({
        where: { name_emailAccountId: { name, emailAccountId } },
        create: {
          gmailLabelId,
          name,
          description,
          enabled,
          emailAccountId,
          icon,
          color,
        },
        update: { name, description, enabled, gmailLabelId, icon, color },
      });
    },
  );

// Deletes a folder at the provider (emails keep their history — Gmail
// removes the label from messages, Outlook removes the category), drops the
// local Label row, and removes the filing that targeted it: rules that only
// existed to file into this folder are deleted, rules that also do other
// things just lose the filing action.
export const deleteLabelAction = actionClient
  .metadata({ name: "deleteLabel" })
  .inputSchema(z.object({ labelId: z.string(), name: z.string() }))
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { labelId, name },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });
      await emailProvider.deleteLabel(labelId);

      await prisma.label.deleteMany({
        where: { emailAccountId, gmailLabelId: labelId },
      });

      // Filing actions that reference this folder, by id or (older rules)
      // by name — same matching as the folder-rule lookup
      const filingActionFilter = {
        OR: [
          { type: ActionType.LABEL, OR: [{ labelId }, { label: name }] },
          {
            type: ActionType.MOVE_FOLDER,
            OR: [{ folderId: labelId }, { folderName: name }],
          },
        ],
      };

      // Org-managed rules are shared configuration; leave them alone
      const rules = await prisma.rule.findMany({
        where: {
          emailAccountId,
          organizationRuleId: null,
          actions: { some: filingActionFilter },
        },
        select: { id: true, actions: { select: { id: true, type: true } } },
      });

      const filingActionIds = await prisma.action.findMany({
        where: { rule: { emailAccountId }, ...filingActionFilter },
        select: { id: true, ruleId: true },
      });
      const filingIdSet = new Set(filingActionIds.map((action) => action.id));

      for (const rule of rules) {
        const remaining = rule.actions.filter(
          (action) => !filingIdSet.has(action.id),
        );
        if (remaining.length === 0) {
          await prisma.rule.delete({ where: { id: rule.id } });
        } else {
          await prisma.action.deleteMany({
            where: { ruleId: rule.id, id: { in: [...filingIdSet] } },
          });
        }
      }

      logger.info("Deleted label", {
        labelId,
        rulesTouched: rules.length,
      });
    },
  );

export const updateLabelVisibilityAction = actionClient
  .metadata({ name: "updateLabelVisibility" })
  .inputSchema(z.object({ labelId: z.string(), visible: z.boolean() }))
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { labelId, visible },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });
      if (!emailProvider.updateLabelVisibility)
        throw new SafeError("Not supported for this email provider");
      await emailProvider.updateLabelVisibility(labelId, visible);
    },
  );

export const updateLabelsAction = actionClient
  .metadata({ name: "updateLabels" })
  .inputSchema(
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
  .inputSchema(sendEmailBody)
  .action(
    async ({ ctx: { emailAccountId, provider, logger }, parsedInput }) => {
      // Attachment content is base64 (~4/3 of the raw size)
      const attachmentBytes =
        parsedInput.attachments?.reduce(
          (sum, attachment) =>
            sum + Math.floor(attachment.content.length * 0.75),
          0,
        ) ?? 0;
      if (attachmentBytes > 10 * 1024 * 1024) {
        throw new SafeError("Attachments are too large (max 10MB in total)");
      }

      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });

      const result = await emailProvider.sendEmailWithHtml(parsedInput);

      return {
        success: true,
        messageId: result.messageId,
        threadId: result.threadId,
      };
    },
  );
