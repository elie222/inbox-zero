import { tool } from "ai";
import { z } from "zod";
import type { EmailProvider } from "@/utils/email/types";
import type { ParsedMessage } from "@/utils/types";
import type { ToolPermissions, ToolCall } from "../types";
import type { Logger } from "@/utils/logger";

// Context passed to all tool executions
export interface ToolContext {
  provider: EmailProvider;
  message: ParsedMessage;
  emailAccountId: string;
  permissions: ToolPermissions;
  logger: Logger;
  recordToolCall: (call: Omit<ToolCall, "timestamp">) => void;
}

/**
 * Create the label email tool
 */
export const createLabelEmailTool = (ctx: ToolContext) =>
  tool({
    description: "Apply a label to the current email to categorize it",
    parameters: z.object({
      labelName: z.string().describe("The name of the label to apply"),
    }),
    execute: async ({ labelName }) => {
      if (!ctx.permissions.canLabel) {
        return { success: false, error: "Labeling is not permitted" };
      }

      ctx.logger.info("Agent applying label", { labelName });

      try {
        // Get or create the label
        const label = await ctx.provider.getOrCreateLabel({ name: labelName });

        // Apply label to the message
        await ctx.provider.addLabel({
          messageId: ctx.message.id,
          threadId: ctx.message.threadId,
          labelId: label.id,
          labelName: label.name,
        });

        ctx.recordToolCall({
          name: "labelEmail",
          args: { labelName },
          result: { success: true, labelId: label.id },
        });

        return { success: true, labelId: label.id, labelName: label.name };
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Failed to apply label";
        ctx.recordToolCall({
          name: "labelEmail",
          args: { labelName },
          error: errorMsg,
        });
        return { success: false, error: errorMsg };
      }
    },
  });

/**
 * Create the archive email tool
 */
export const createArchiveEmailTool = (ctx: ToolContext) =>
  tool({
    description: "Archive the current email (remove from inbox)",
    parameters: z.object({}),
    execute: async () => {
      if (!ctx.permissions.canArchive) {
        return { success: false, error: "Archiving is not permitted" };
      }

      ctx.logger.info("Agent archiving email");

      try {
        await ctx.provider.archiveThread(ctx.message.threadId);

        ctx.recordToolCall({
          name: "archiveEmail",
          args: {},
          result: { success: true },
        });

        return { success: true };
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Failed to archive";
        ctx.recordToolCall({
          name: "archiveEmail",
          args: {},
          error: errorMsg,
        });
        return { success: false, error: errorMsg };
      }
    },
  });

/**
 * Create the draft reply tool
 */
export const createDraftReplyTool = (ctx: ToolContext) =>
  tool({
    description:
      "Create a draft reply to the current email. The user will review before sending.",
    parameters: z.object({
      content: z.string().describe("The content of the reply"),
      subject: z
        .string()
        .optional()
        .describe("Override subject (defaults to Re: original subject)"),
    }),
    execute: async ({ content, subject }) => {
      if (!ctx.permissions.canDraftReply) {
        return { success: false, error: "Drafting replies is not permitted" };
      }

      ctx.logger.info("Agent drafting reply");

      try {
        const draftSubject =
          subject ||
          (ctx.message.headers.subject?.startsWith("Re:")
            ? ctx.message.headers.subject
            : `Re: ${ctx.message.headers.subject || ""}`);

        const draft = await ctx.provider.createDraft({
          to: ctx.message.headers.from,
          subject: draftSubject,
          content,
          threadId: ctx.message.threadId,
          replyToMessageId: ctx.message.id,
        });

        ctx.recordToolCall({
          name: "draftReply",
          args: { content: `${content.substring(0, 100)}...`, subject },
          result: { success: true, draftId: draft.id },
        });

        return { success: true, draftId: draft.id };
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Failed to create draft";
        ctx.recordToolCall({
          name: "draftReply",
          args: { content: `${content.substring(0, 100)}...` },
          error: errorMsg,
        });
        return { success: false, error: errorMsg };
      }
    },
  });

/**
 * Create the mark as read tool
 */
export const createMarkReadTool = (ctx: ToolContext) =>
  tool({
    description: "Mark the current email as read",
    parameters: z.object({}),
    execute: async () => {
      if (!ctx.permissions.canMarkRead) {
        return { success: false, error: "Marking as read is not permitted" };
      }

      ctx.logger.info("Agent marking email as read");

      try {
        await ctx.provider.markRead({
          messageId: ctx.message.id,
          threadId: ctx.message.threadId,
        });

        ctx.recordToolCall({
          name: "markRead",
          args: {},
          result: { success: true },
        });

        return { success: true };
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Failed to mark as read";
        ctx.recordToolCall({
          name: "markRead",
          args: {},
          error: errorMsg,
        });
        return { success: false, error: errorMsg };
      }
    },
  });

/**
 * Create the forward email tool
 */
export const createForwardEmailTool = (ctx: ToolContext) =>
  tool({
    description: "Forward the current email to an allowed recipient",
    parameters: z.object({
      to: z.string().email().describe("Email address to forward to"),
      note: z
        .string()
        .optional()
        .describe("Optional note to include with the forward"),
    }),
    execute: async ({ to, note }) => {
      const allowList = ctx.permissions.forwardAllowList;

      if (allowList.length === 0) {
        return { success: false, error: "Forwarding is not permitted" };
      }

      // Check if recipient is in allow list
      const isAllowed = allowList.some(
        (allowed) =>
          to.toLowerCase() === allowed.toLowerCase() ||
          to.toLowerCase().endsWith(`@${allowed.toLowerCase()}`),
      );

      if (!isAllowed) {
        return {
          success: false,
          error: `Forwarding to ${to} is not permitted. Allowed: ${allowList.join(", ")}`,
        };
      }

      ctx.logger.info("Agent forwarding email", { to });

      try {
        const content = note
          ? `${note}\n\n---------- Forwarded message ----------\n${ctx.message.textPlain || ctx.message.textHtml || ""}`
          : ctx.message.textPlain || ctx.message.textHtml || "";

        await ctx.provider.sendEmail({
          to,
          subject: `Fwd: ${ctx.message.headers.subject || ""}`,
          content,
          replyToMessageId: ctx.message.id,
        });

        ctx.recordToolCall({
          name: "forwardEmail",
          args: { to, note },
          result: { success: true },
        });

        return { success: true };
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Failed to forward";
        ctx.recordToolCall({
          name: "forwardEmail",
          args: { to },
          error: errorMsg,
        });
        return { success: false, error: errorMsg };
      }
    },
  });

/**
 * Create the manage labels tool
 */
export const createManageLabelsTool = (ctx: ToolContext) =>
  tool({
    description: "List available labels or create a new label",
    parameters: z.object({
      action: z.enum(["list", "create"]).describe("Action to perform"),
      labelName: z
        .string()
        .optional()
        .describe("Name of label to create (required for create action)"),
    }),
    execute: async ({ action, labelName }) => {
      if (action === "list") {
        try {
          const labels = await ctx.provider.getLabels();
          ctx.recordToolCall({
            name: "manageLabels",
            args: { action: "list" },
            result: { labels: labels.map((l) => l.name) },
          });
          return {
            success: true,
            labels: labels.map((l) => ({ id: l.id, name: l.name })),
          };
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : "Failed to list labels";
          return { success: false, error: errorMsg };
        }
      }

      if (action === "create") {
        if (!ctx.permissions.canCreateLabel) {
          return { success: false, error: "Creating labels is not permitted" };
        }

        if (!labelName) {
          return {
            success: false,
            error: "labelName is required for create action",
          };
        }

        try {
          const label = await ctx.provider.getOrCreateLabel({
            name: labelName,
          });
          ctx.recordToolCall({
            name: "manageLabels",
            args: { action: "create", labelName },
            result: { success: true, labelId: label.id },
          });
          return { success: true, labelId: label.id, labelName: label.name };
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : "Failed to create label";
          return { success: false, error: errorMsg };
        }
      }

      return { success: false, error: "Invalid action" };
    },
  });

/**
 * Get all permitted email tools for a context
 */
export function getEmailTools(ctx: ToolContext) {
  const tools: Record<string, ReturnType<typeof tool>> = {};

  // Always include label tool (listing is always useful)
  tools.manageLabels = createManageLabelsTool(ctx);

  if (ctx.permissions.canLabel) {
    tools.labelEmail = createLabelEmailTool(ctx);
  }

  if (ctx.permissions.canArchive) {
    tools.archiveEmail = createArchiveEmailTool(ctx);
  }

  if (ctx.permissions.canDraftReply) {
    tools.draftReply = createDraftReplyTool(ctx);
  }

  if (ctx.permissions.canMarkRead) {
    tools.markRead = createMarkReadTool(ctx);
  }

  if (ctx.permissions.forwardAllowList.length > 0) {
    tools.forwardEmail = createForwardEmailTool(ctx);
  }

  return tools;
}
