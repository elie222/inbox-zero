"use server";

import { z } from "zod";
import prisma from "@/utils/prisma";
import { sendEmailBody } from "@/utils/gmail/mail";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";
import {
  deleteMailboxItemBody,
  removeThreadLabelBody,
  renameMailboxItemBody,
  unarchiveThreadBody,
  untrashThreadBody,
  updateLabelColorBody,
} from "@/utils/actions/mail.validation";
import { isMicrosoftProvider } from "@/utils/email/provider-types";

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

export const unarchiveThreadAction = actionClient
  .metadata({ name: "unarchiveThread" })
  .inputSchema(unarchiveThreadBody)
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

      try {
        await emailProvider.unarchiveThread(threadId);
      } catch (error) {
        logger.error("Failed to unarchive thread", { error });
        throw new SafeError("Failed to unarchive email. Please try again.");
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

export const untrashThreadAction = actionClient
  .metadata({ name: "untrashThread" })
  .inputSchema(untrashThreadBody)
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

      try {
        await emailProvider.untrashThread(threadId);
      } catch (error) {
        logger.error("Failed to untrash thread", { error });
        throw new SafeError("Failed to restore email. Please try again.");
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

export const removeThreadLabelAction = actionClient
  .metadata({ name: "removeThreadLabel" })
  .inputSchema(removeThreadLabelBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { threadId, labelId },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });

      try {
        await emailProvider.removeThreadLabel(threadId, labelId);
      } catch (error) {
        logger.error("Failed to remove thread label", { error });
        throw new SafeError("Failed to remove label. Please try again.");
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

export const renameMailboxItemAction = actionClient
  .metadata({ name: "renameMailboxItem" })
  .inputSchema(renameMailboxItemBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { kind, id, name },
    }) => {
      assertMailboxItemMutationSupported({ kind, provider, action: "rename" });
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });

      try {
        if (kind === "folder") await emailProvider.renameFolder(id, name);
        else await emailProvider.renameLabel(id, name);
      } catch (error) {
        logger.error("Failed to rename mailbox item", { error, kind });
        throw new SafeError(`Failed to rename ${kind}. Please try again.`);
      }
    },
  );

export const updateLabelColorAction = actionClient
  .metadata({ name: "updateLabelColor" })
  .inputSchema(updateLabelColorBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { labelId, color },
    }) => {
      if (!isMicrosoftProvider(provider)) {
        throw new SafeError(
          "Category colors are only available for Outlook accounts.",
        );
      }
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });

      try {
        await emailProvider.updateLabelColor(labelId, color);
      } catch (error) {
        logger.error("Failed to update category color", { error });
        throw new SafeError("Failed to update category. Please try again.");
      }
    },
  );

export const deleteMailboxItemAction = actionClient
  .metadata({ name: "deleteMailboxItem" })
  .inputSchema(deleteMailboxItemBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { kind, id },
    }) => {
      assertMailboxItemMutationSupported({ kind, provider, action: "delete" });
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });

      try {
        if (kind === "folder") await emailProvider.deleteFolder(id);
        else await emailProvider.deleteLabel(id);
      } catch (error) {
        logger.error("Failed to delete mailbox item", { error, kind });
        throw new SafeError(`Failed to delete ${kind}. Please try again.`);
      }
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

function assertMailboxItemMutationSupported({
  kind,
  provider,
  action,
}: {
  kind: "label" | "folder";
  provider: string;
  action: "rename" | "delete";
}) {
  if (kind === "folder" && !isMicrosoftProvider(provider)) {
    throw new SafeError(
      "Folder actions are only available for Outlook accounts.",
    );
  }
  if (
    action === "rename" &&
    kind === "label" &&
    isMicrosoftProvider(provider)
  ) {
    throw new SafeError(
      "Outlook category names cannot be changed. Edit its color instead.",
    );
  }
}
