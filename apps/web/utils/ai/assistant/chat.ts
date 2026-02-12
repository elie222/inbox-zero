import { type InferUITool, tool, type ModelMessage } from "ai";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import { createRuleSchema } from "@/utils/ai/rule/create-rule-schema";
import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import {
  createRule,
  partialUpdateRule,
  updateRuleActions,
} from "@/utils/rule/rule";
import {
  ActionType,
  GroupItemType,
  LogicalOperator,
  SystemType,
} from "@/generated/prisma/enums";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { saveLearnedPatterns } from "@/utils/rule/learned-patterns";
import { posthogCaptureEvent } from "@/utils/posthog";
import { chatCompletionStream } from "@/utils/llms";
import { filterNullProperties } from "@/utils";
import { delayInMinutesSchema } from "@/utils/actions/rule.validation";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import type { MessageContext } from "@/app/api/chat/validation";
import { stringifyEmail } from "@/utils/stringify-email";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import type { ParsedMessage } from "@/utils/types";
import { env } from "@/env";
import { createEmailProvider } from "@/utils/email/provider";
import { sendEmailBody } from "@/utils/gmail/mail";
import { getRuleLabel } from "@/utils/rule/consts";

const emptyInputSchema = z.object({}).describe("No parameters required");

type GetUserRulesAndSettingsOutput = {
  about: string;
  rules:
    | Array<{
        name: string;
        conditions: {
          aiInstructions: string | null;
          static?: Partial<{
            from: string | null;
            to: string | null;
            subject: string | null;
          }>;
          conditionalOperator?: LogicalOperator;
        };
        actions: Array<{
          type: ActionType;
          fields: Partial<{
            label: string | null;
            content: string | null;
            to: string | null;
            cc: string | null;
            bcc: string | null;
            subject: string | null;
            url: string | null;
            folderName: string | null;
          }>;
        }>;
        enabled: boolean;
        runOnThreads: boolean;
      }>
    | undefined;
};

export const maxDuration = 120;

// tools
const getUserRulesAndSettingsTool = ({
  email,
  emailAccountId,
  logger,
}: {
  email: string;
  emailAccountId: string;
  logger: Logger;
}) =>
  tool<z.infer<typeof emptyInputSchema>, GetUserRulesAndSettingsOutput>({
    description:
      "Retrieve all existing rules for the user, their about information",
    inputSchema: emptyInputSchema,
    execute: async (_input: z.infer<typeof emptyInputSchema>) => {
      trackToolCall({
        tool: "get_user_rules_and_settings",
        email,
        logger,
      });

      const emailAccount = await prisma.emailAccount.findUnique({
        where: { id: emailAccountId },
        select: {
          about: true,
          rules: {
            select: {
              name: true,
              instructions: true,
              from: true,
              to: true,
              subject: true,
              conditionalOperator: true,
              enabled: true,
              runOnThreads: true,
              actions: {
                select: {
                  type: true,
                  content: true,
                  label: true,
                  to: true,
                  cc: true,
                  bcc: true,
                  subject: true,
                  url: true,
                  folderName: true,
                },
              },
            },
          },
        },
      });

      return {
        about: emailAccount?.about || "Not set",
        rules: emailAccount?.rules.map((rule) => {
          const staticFilter = filterNullProperties({
            from: rule.from,
            to: rule.to,
            subject: rule.subject,
          });

          const staticConditions =
            Object.keys(staticFilter).length > 0 ? staticFilter : undefined;

          return {
            name: rule.name,
            conditions: {
              aiInstructions: rule.instructions,
              static: staticConditions,
              // only need to show conditional operator if there are multiple conditions
              conditionalOperator:
                rule.instructions && staticConditions
                  ? rule.conditionalOperator
                  : undefined,
            },
            actions: rule.actions.map((action) => ({
              type: action.type,
              fields: filterNullProperties({
                label: action.label,
                content: action.content,
                to: action.to,
                cc: action.cc,
                bcc: action.bcc,
                subject: action.subject,
                url: action.url,
                folderName: action.folderName,
              }),
            })),
            enabled: rule.enabled,
            runOnThreads: rule.runOnThreads,
          };
        }),
      };
    },
  });

export type GetUserRulesAndSettingsTool = InferUITool<
  ReturnType<typeof getUserRulesAndSettingsTool>
>;

const getLearnedPatternsTool = ({
  email,
  emailAccountId,
  logger,
}: {
  email: string;
  emailAccountId: string;
  logger: Logger;
}) =>
  tool({
    description: "Retrieve the learned patterns for a rule",
    inputSchema: z.object({
      ruleName: z
        .string()
        .describe("The name of the rule to get the learned patterns for"),
    }),
    execute: async ({ ruleName }) => {
      trackToolCall({ tool: "get_learned_patterns", email, logger });

      const rule = await prisma.rule.findUnique({
        where: { name_emailAccountId: { name: ruleName, emailAccountId } },
        select: {
          group: {
            select: {
              items: {
                select: {
                  type: true,
                  value: true,
                  exclude: true,
                },
              },
            },
          },
        },
      });

      if (!rule) {
        return {
          error:
            "Rule not found. Try listing the rules again. The user may have made changes since you last checked.",
        };
      }

      return {
        patterns: rule.group?.items,
      };
    },
  });

export type GetLearnedPatternsTool = InferUITool<
  ReturnType<typeof getLearnedPatternsTool>
>;

const createRuleTool = ({
  email,
  emailAccountId,
  provider,
  logger,
}: {
  email: string;
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) =>
  tool({
    description: "Create a new rule",
    inputSchema: createRuleSchema(provider),
    execute: async ({ name, condition, actions }) => {
      trackToolCall({ tool: "create_rule", email, logger });

      try {
        const rule = await createRule({
          result: {
            name,
            condition,
            actions: actions.map((action) => ({
              type: action.type,
              fields: action.fields
                ? {
                    content: action.fields.content ?? null,
                    to: action.fields.to ?? null,
                    subject: action.fields.subject ?? null,
                    label: action.fields.label ?? null,
                    webhookUrl: action.fields.webhookUrl ?? null,
                    cc: action.fields.cc ?? null,
                    bcc: action.fields.bcc ?? null,
                    ...(isMicrosoftProvider(provider) && {
                      folderName: action.fields.folderName ?? null,
                    }),
                  }
                : null,
            })),
          },
          emailAccountId,
          provider,
          runOnThreads: true,
          logger,
        });

        return { success: true, ruleId: rule.id };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        logger.error("Failed to create rule", { error });

        return { error: "Failed to create rule", message };
      }
    },
  });

export type CreateRuleTool = InferUITool<ReturnType<typeof createRuleTool>>;

const updateRuleConditionSchema = z.object({
  ruleName: z.string().describe("The name of the rule to update"),
  condition: z.object({
    aiInstructions: z.string().optional(),
    static: z
      .object({
        from: z.string().nullish(),
        to: z.string().nullish(),
        subject: z.string().nullish(),
      })
      .nullish(),
    conditionalOperator: z
      .enum([LogicalOperator.AND, LogicalOperator.OR])
      .nullish(),
  }),
});
export type UpdateRuleConditionSchema = z.infer<
  typeof updateRuleConditionSchema
>;

const updateRuleConditionsTool = ({
  email,
  emailAccountId,
  logger,
}: {
  email: string;
  emailAccountId: string;
  logger: Logger;
}) =>
  tool({
    description: "Update the conditions of an existing rule",
    inputSchema: updateRuleConditionSchema,
    execute: async ({ ruleName, condition }) => {
      trackToolCall({ tool: "update_rule_conditions", email, logger });

      const rule = await prisma.rule.findUnique({
        where: { name_emailAccountId: { name: ruleName, emailAccountId } },
        select: {
          id: true,
          name: true,
          instructions: true,
          from: true,
          to: true,
          subject: true,
          conditionalOperator: true,
        },
      });

      if (!rule) {
        return {
          success: false,
          ruleId: "",
          error:
            "Rule not found. Try listing the rules again. The user may have made changes since you last checked.",
        };
      }

      // Store original state
      const originalConditions = {
        aiInstructions: rule.instructions,
        static: filterNullProperties({
          from: rule.from,
          to: rule.to,
          subject: rule.subject,
        }),
        conditionalOperator: rule.conditionalOperator,
      };

      await partialUpdateRule({
        ruleId: rule.id,
        data: {
          instructions: condition.aiInstructions,
          from: condition.static?.from,
          to: condition.static?.to,
          subject: condition.static?.subject,
          conditionalOperator: condition.conditionalOperator ?? undefined,
        },
      });

      // Prepare updated state
      const updatedConditions = {
        aiInstructions: condition.aiInstructions,
        static: condition.static
          ? filterNullProperties({
              from: condition.static.from,
              to: condition.static.to,
              subject: condition.static.subject,
            })
          : undefined,
        conditionalOperator: condition.conditionalOperator,
      };

      return {
        success: true,
        ruleId: rule.id,
        originalConditions,
        updatedConditions,
      };
    },
  });

export type UpdateRuleConditionsTool = InferUITool<
  ReturnType<typeof updateRuleConditionsTool>
>;

export type UpdateRuleConditionsOutput = {
  success: boolean;
  ruleId: string;
  error?: string;
  originalConditions?: {
    aiInstructions: string | null;
    static?: Record<string, string | null>;
    conditionalOperator: string | null;
  };
  updatedConditions?: {
    aiInstructions: string | null | undefined;
    static?: Record<string, string | null>;
    conditionalOperator: string | null | undefined;
  };
};

const updateRuleActionsTool = ({
  email,
  emailAccountId,
  provider,
  logger,
}: {
  email: string;
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Update the actions of an existing rule. This replaces the existing actions.",
    inputSchema: z.object({
      ruleName: z.string().describe("The name of the rule to update"),
      actions: z.array(
        z.object({
          type: z.enum([
            ActionType.ARCHIVE,
            ActionType.LABEL,
            ActionType.DRAFT_EMAIL,
            ActionType.FORWARD,
            ActionType.REPLY,
            ActionType.SEND_EMAIL,
            ActionType.MARK_READ,
            ActionType.MARK_SPAM,
            ActionType.CALL_WEBHOOK,
            ActionType.DIGEST,
          ]),
          fields: z.object({
            label: z.string().nullish(),
            content: z.string().nullish(),
            webhookUrl: z.string().nullish(),
            to: z.string().nullish(),
            cc: z.string().nullish(),
            bcc: z.string().nullish(),
            subject: z.string().nullish(),
            folderName: z.string().nullish(),
          }),
          delayInMinutes: delayInMinutesSchema,
        }),
      ),
    }),
    execute: async ({ ruleName, actions }) => {
      trackToolCall({ tool: "update_rule_actions", email, logger });
      const rule = await prisma.rule.findUnique({
        where: { name_emailAccountId: { name: ruleName, emailAccountId } },
        select: {
          id: true,
          name: true,
          actions: {
            select: {
              type: true,
              content: true,
              label: true,
              to: true,
              cc: true,
              bcc: true,
              subject: true,
              url: true,
              folderName: true,
            },
          },
        },
      });

      if (!rule) {
        return {
          success: false,
          ruleId: "",
          error:
            "Rule not found. Try listing the rules again. The user may have made changes since you last checked.",
        };
      }

      // Store original actions
      const originalActions = rule.actions.map((action) => ({
        type: action.type,
        fields: filterNullProperties({
          label: action.label,
          content: action.content,
          to: action.to,
          cc: action.cc,
          bcc: action.bcc,
          subject: action.subject,
          webhookUrl: action.url,
          ...(isMicrosoftProvider(provider) && {
            folderName: action.folderName,
          }),
        }),
      }));

      await updateRuleActions({
        ruleId: rule.id,
        actions: actions.map((action) => ({
          type: action.type,
          fields: {
            label: action.fields?.label ?? null,
            to: action.fields?.to ?? null,
            cc: action.fields?.cc ?? null,
            bcc: action.fields?.bcc ?? null,
            subject: action.fields?.subject ?? null,
            content: action.fields?.content ?? null,
            webhookUrl: action.fields?.webhookUrl ?? null,
            ...(isMicrosoftProvider(provider) && {
              folderName: action.fields?.folderName ?? null,
            }),
          },
          delayInMinutes: action.delayInMinutes ?? null,
        })),
        provider,
        emailAccountId,
        logger,
      });

      return {
        success: true,
        ruleId: rule.id,
        originalActions,
        updatedActions: actions,
      };
    },
  });

export type UpdateRuleActionsTool = InferUITool<
  ReturnType<typeof updateRuleActionsTool>
>;

export type UpdateRuleActionsOutput = {
  success: boolean;
  ruleId: string;
  error?: string;
  originalActions?: Array<{
    type: string;
    fields: Record<string, string | null>;
  }>;
  updatedActions?: Array<{
    type: string;
    fields: Record<string, string | null>;
    delayInMinutes?: number | null;
  }>;
};

const updateLearnedPatternsTool = ({
  email,
  emailAccountId,
  logger,
}: {
  email: string;
  emailAccountId: string;
  logger: Logger;
}) =>
  tool({
    description: "Update the learned patterns of an existing rule",
    inputSchema: z.object({
      ruleName: z.string().describe("The name of the rule to update"),
      learnedPatterns: z
        .array(
          z.object({
            include: z
              .object({
                from: z.string().optional(),
                subject: z.string().optional(),
              })
              .optional(),
            exclude: z
              .object({
                from: z.string().optional(),
                subject: z.string().optional(),
              })
              .optional(),
          }),
        )
        .min(1, "At least one learned pattern is required"),
    }),
    execute: async ({ ruleName, learnedPatterns }) => {
      trackToolCall({ tool: "update_learned_patterns", email, logger });

      const rule = await prisma.rule.findUnique({
        where: { name_emailAccountId: { name: ruleName, emailAccountId } },
      });

      if (!rule) {
        return {
          success: false,
          ruleId: "",
          error:
            "Rule not found. Try listing the rules again. The user may have made changes since you last checked.",
        };
      }

      // Convert the learned patterns format
      const patternsToSave: Array<{
        type: GroupItemType;
        value: string;
        exclude?: boolean;
      }> = [];

      for (const pattern of learnedPatterns) {
        if (pattern.include?.from) {
          patternsToSave.push({
            type: GroupItemType.FROM,
            value: pattern.include.from,
            exclude: false,
          });
        }

        if (pattern.include?.subject) {
          patternsToSave.push({
            type: GroupItemType.SUBJECT,
            value: pattern.include.subject,
            exclude: false,
          });
        }

        if (pattern.exclude?.from) {
          patternsToSave.push({
            type: GroupItemType.FROM,
            value: pattern.exclude.from,
            exclude: true,
          });
        }

        if (pattern.exclude?.subject) {
          patternsToSave.push({
            type: GroupItemType.SUBJECT,
            value: pattern.exclude.subject,
            exclude: true,
          });
        }
      }

      if (patternsToSave.length > 0) {
        await saveLearnedPatterns({
          emailAccountId,
          ruleName: rule.name,
          patterns: patternsToSave,
          logger,
        });
      }

      return { success: true, ruleId: rule.id };
    },
  });

export type UpdateLearnedPatternsTool = InferUITool<
  ReturnType<typeof updateLearnedPatternsTool>
>;

const updateAboutTool = ({
  email,
  emailAccountId,
  logger,
}: {
  email: string;
  emailAccountId: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Update the user's about information. Read the user's about information first as this replaces the existing information.",
    inputSchema: z.object({ about: z.string() }),
    execute: async ({ about }) => {
      trackToolCall({ tool: "update_about", email, logger });
      const existing = await prisma.emailAccount.findUnique({
        where: { id: emailAccountId },
        select: { about: true },
      });

      if (!existing) return { error: "Account not found" };

      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: { about },
      });

      return {
        success: true,
        previousAbout: existing.about,
        updatedAbout: about,
      };
    },
  });

export type UpdateAboutTool = InferUITool<ReturnType<typeof updateAboutTool>>;

const addToKnowledgeBaseTool = ({
  email,
  emailAccountId,
  logger,
}: {
  email: string;
  emailAccountId: string;
  logger: Logger;
}) =>
  tool({
    description: "Add content to the knowledge base",
    inputSchema: z.object({
      title: z.string(),
      content: z.string(),
    }),
    execute: async ({ title, content }) => {
      trackToolCall({ tool: "add_to_knowledge_base", email, logger });

      try {
        await prisma.knowledge.create({
          data: {
            emailAccountId,
            title,
            content,
          },
        });

        return { success: true };
      } catch (error) {
        if (isDuplicateError(error, "title")) {
          return {
            error: "A knowledge item with this title already exists",
          };
        }

        logger.error("Failed to add to knowledge base", { error });
        return { error: "Failed to add to knowledge base" };
      }
    },
  });

export type AddToKnowledgeBaseTool = InferUITool<
  ReturnType<typeof addToKnowledgeBaseTool>
>;

const getAccountOverviewTool = ({
  email,
  emailAccountId,
  provider,
  logger,
}: {
  email: string;
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Get account context for inbox operations: provider, labels, meeting briefs settings, and auto-filing attachment settings.",
    inputSchema: emptyInputSchema,
    execute: async () => {
      trackToolCall({ tool: "get_account_overview", email, logger });

      const [emailAccount, labelNames] = await Promise.all([
        prisma.emailAccount.findUnique({
          where: { id: emailAccountId },
          select: {
            email: true,
            timezone: true,
            meetingBriefingsEnabled: true,
            meetingBriefingsMinutesBefore: true,
            meetingBriefsSendEmail: true,
            filingEnabled: true,
            filingPrompt: true,
            filingFolders: {
              select: {
                folderName: true,
                folderPath: true,
              },
              take: 50,
            },
            driveConnections: {
              select: {
                id: true,
              },
              take: 1,
            },
          },
        }),
        listLabelNames({
          emailAccountId,
          provider,
          logger,
        }),
      ]);

      if (!emailAccount) {
        return { error: "Email account not found" };
      }

      return {
        account: {
          email: emailAccount.email,
          provider,
          timezone: emailAccount.timezone,
        },
        meetingBriefs: {
          enabled: emailAccount.meetingBriefingsEnabled,
          minutesBefore: emailAccount.meetingBriefingsMinutesBefore,
          sendEmail: emailAccount.meetingBriefsSendEmail,
        },
        attachmentFiling: {
          enabled: emailAccount.filingEnabled,
          promptConfigured: Boolean(emailAccount.filingPrompt),
          driveConnected: emailAccount.driveConnections.length > 0,
          folders: emailAccount.filingFolders.map((folder) => ({
            name: folder.folderName,
            path: folder.folderPath,
          })),
        },
        labels: {
          count: labelNames.length,
          names: labelNames.slice(0, 200),
        },
      };
    },
  });

export type GetAccountOverviewTool = InferUITool<
  ReturnType<typeof getAccountOverviewTool>
>;

const searchInboxInputSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .optional()
    .describe(
      "Inbox search query. Use concise keywords by default. For Google accounts, Gmail syntax like from:, to:, subject:, and in: is supported.",
    ),
  after: z.coerce
    .date()
    .optional()
    .describe("Only include messages after this datetime (ISO format)."),
  before: z.coerce
    .date()
    .optional()
    .describe("Only include messages before this datetime (ISO format)."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe("Maximum number of messages to return."),
  pageToken: z
    .string()
    .optional()
    .describe("Use the page token returned from a prior search to paginate."),
  inboxOnly: z
    .boolean()
    .default(true)
    .describe("If true, restrict results to inbox messages."),
  unreadOnly: z
    .boolean()
    .default(false)
    .describe("If true, only return unread messages."),
});

const searchInboxTool = ({
  email,
  emailAccountId,
  provider,
  logger,
}: {
  email: string;
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Search inbox messages and return concise message metadata for triage and summarization.",
    inputSchema: searchInboxInputSchema,
    execute: async ({
      query,
      after,
      before,
      limit,
      pageToken,
      inboxOnly,
      unreadOnly,
    }) => {
      trackToolCall({ tool: "search_inbox", email, logger });

      try {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
          logger,
        });

        const { messages, nextPageToken } =
          await emailProvider.getMessagesWithPagination({
            query: query?.trim(),
            maxResults: limit,
            pageToken,
            after,
            before,
            inboxOnly,
            unreadOnly,
          });

        let labels: Array<{ id: string; name: string }> = [];
        try {
          labels = await emailProvider.getLabels();
        } catch (error) {
          logger.warn("Failed to load labels for search results", { error });
        }

        const labelsById = createLabelLookupMap(labels);

        const filteredMessages = messages
          .filter((message) =>
            shouldIncludeMessage({
              message,
              provider,
              inboxOnly,
              unreadOnly,
            }),
          )
          .slice(0, limit);

        const items = filteredMessages.map((message) =>
          mapMessageForSearchResult(message, labelsById),
        );

        return {
          queryUsed: query?.trim() || null,
          totalReturned: items.length,
          nextPageToken,
          summary: summarizeSearchResults(items),
          messages: items,
        };
      } catch (error) {
        logger.error("Failed to search inbox", { error });
        return { error: "Failed to search inbox" };
      }
    },
  });

export type SearchInboxTool = InferUITool<ReturnType<typeof searchInboxTool>>;

const threadIdsSchema = z
  .array(z.string())
  .min(1)
  .max(100)
  .transform((ids) => [...new Set(ids)]);

const senderEmailsSchema = z
  .array(z.string().trim().min(3))
  .min(1)
  .max(100)
  .transform((emails) => [...new Set(emails)]);

const manageInboxInputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("archive_threads"),
    threadIds: threadIdsSchema,
    labelId: z.string().optional(),
  }),
  z.object({
    action: z.literal("mark_read_threads"),
    threadIds: threadIdsSchema,
    read: z.boolean().default(true),
  }),
  z.object({
    action: z.literal("bulk_archive_senders"),
    fromEmails: senderEmailsSchema,
  }),
]);

const manageInboxTool = ({
  email,
  emailAccountId,
  provider,
  logger,
}: {
  email: string;
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Run inbox actions: archive threads, mark threads read/unread, or bulk archive by sender.",
    inputSchema: manageInboxInputSchema,
    execute: async (input) => {
      trackToolCall({ tool: "manage_inbox", email, logger });

      try {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
          logger,
        });

        if (input.action === "bulk_archive_senders") {
          await emailProvider.bulkArchiveFromSenders(
            input.fromEmails,
            email,
            emailAccountId,
          );

          return {
            success: true,
            action: input.action,
            sendersCount: input.fromEmails.length,
            senders: input.fromEmails,
          };
        }

        const threadActionResults = await runThreadActionsInParallel({
          threadIds: input.threadIds,
          runAction: async (threadId) => {
            if (input.action === "archive_threads") {
              await emailProvider.archiveThreadWithLabel(
                threadId,
                email,
                input.labelId,
              );
            } else {
              await emailProvider.markReadThread(threadId, input.read);
            }
          },
        });

        const failedThreadIds = threadActionResults
          .filter((result) => !result.success)
          .map((result) => result.threadId);
        const successCount =
          threadActionResults.length - failedThreadIds.length;

        return {
          success: failedThreadIds.length === 0,
          action: input.action,
          requestedCount: input.threadIds.length,
          successCount,
          failedCount: failedThreadIds.length,
          failedThreadIds,
        };
      } catch (error) {
        logger.error("Failed to run inbox action", { error });
        return { error: "Failed to run inbox action" };
      }
    },
  });

export type ManageInboxTool = InferUITool<ReturnType<typeof manageInboxTool>>;

const updateInboxFeaturesInputSchema = z
  .object({
    meetingBriefsEnabled: z.boolean().optional(),
    meetingBriefsMinutesBefore: z.number().int().min(1).max(2880).optional(),
    meetingBriefsSendEmail: z.boolean().optional(),
    filingEnabled: z.boolean().optional(),
    filingPrompt: z.string().max(6000).optional().nullable(),
  })
  .refine(
    (value) =>
      value.meetingBriefsEnabled !== undefined ||
      value.meetingBriefsMinutesBefore !== undefined ||
      value.meetingBriefsSendEmail !== undefined ||
      value.filingEnabled !== undefined ||
      value.filingPrompt !== undefined,
    { message: "At least one field must be provided." },
  );

const updateInboxFeaturesTool = ({
  email,
  emailAccountId,
  logger,
}: {
  email: string;
  emailAccountId: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Update account-level inbox features, including meeting briefs and auto-file attachments.",
    inputSchema: updateInboxFeaturesInputSchema,
    execute: async ({
      meetingBriefsEnabled,
      meetingBriefsMinutesBefore,
      meetingBriefsSendEmail,
      filingEnabled,
      filingPrompt,
    }) => {
      trackToolCall({ tool: "update_inbox_features", email, logger });

      const existing = await prisma.emailAccount.findUnique({
        where: { id: emailAccountId },
        select: {
          meetingBriefingsEnabled: true,
          meetingBriefingsMinutesBefore: true,
          meetingBriefsSendEmail: true,
          filingEnabled: true,
          filingPrompt: true,
        },
      });

      if (!existing) return { error: "Email account not found" };

      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: {
          ...(meetingBriefsEnabled !== undefined && {
            meetingBriefingsEnabled: meetingBriefsEnabled,
          }),
          ...(meetingBriefsMinutesBefore !== undefined && {
            meetingBriefingsMinutesBefore: meetingBriefsMinutesBefore,
          }),
          ...(meetingBriefsSendEmail !== undefined && {
            meetingBriefsSendEmail,
          }),
          ...(filingEnabled !== undefined && {
            filingEnabled,
          }),
          ...(filingPrompt !== undefined && {
            filingPrompt,
          }),
        },
      });

      return {
        success: true,
        previous: {
          meetingBriefsEnabled: existing.meetingBriefingsEnabled,
          meetingBriefsMinutesBefore: existing.meetingBriefingsMinutesBefore,
          meetingBriefsSendEmail: existing.meetingBriefsSendEmail,
          filingEnabled: existing.filingEnabled,
          filingPrompt: existing.filingPrompt,
        },
        updated: {
          meetingBriefsEnabled:
            meetingBriefsEnabled ?? existing.meetingBriefingsEnabled,
          meetingBriefsMinutesBefore:
            meetingBriefsMinutesBefore ??
            existing.meetingBriefingsMinutesBefore,
          meetingBriefsSendEmail:
            meetingBriefsSendEmail ?? existing.meetingBriefsSendEmail,
          filingEnabled: filingEnabled ?? existing.filingEnabled,
          filingPrompt: filingPrompt ?? existing.filingPrompt,
        },
      };
    },
  });

export type UpdateInboxFeaturesTool = InferUITool<
  ReturnType<typeof updateInboxFeaturesTool>
>;

const sendEmailTool = ({
  email,
  emailAccountId,
  provider,
  logger,
}: {
  email: string;
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Send an email immediately from the connected mailbox. Use only when the user clearly asks to send now.",
    inputSchema: sendEmailBody,
    execute: async (input) => {
      trackToolCall({ tool: "send_email", email, logger });

      try {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
          logger,
        });
        const result = await emailProvider.sendEmailWithHtml(input);
        return {
          success: true,
          messageId: result.messageId,
          threadId: result.threadId,
          to: input.to,
          subject: input.subject,
        };
      } catch (error) {
        logger.error("Failed to send email from chat", { error });
        return { error: "Failed to send email" };
      }
    },
  });

export type SendEmailTool = InferUITool<ReturnType<typeof sendEmailTool>>;

export async function aiProcessAssistantChat({
  messages,
  emailAccountId,
  user,
  context,
  logger,
}: {
  messages: ModelMessage[];
  emailAccountId: string;
  user: EmailAccountWithAI;
  context?: MessageContext;
  logger: Logger;
}) {
  const system = `You are the Inbox Zero assistant. You help users understand their inbox, take inbox actions, update account features, and manage automation rules.

Core responsibilities:
1. Search and summarize inbox activity (especially what's new and what needs attention)
2. Take inbox actions (archive, mark read, and bulk archive by sender)
3. Update account features (meeting briefs and auto-file attachments)
4. Create and update rules

Tool usage strategy (progressive disclosure):
- Use the minimum number of tools needed.
- Start with read-only context tools before write tools.
- For write operations that affect many emails, first summarize what will change, then execute after clear user confirmation.
- If the user asks for an inbox update, search recent messages first and prioritize "To Reply" items.
- Only send emails when the user clearly asks to send now.

Provider context:
- Current provider: ${user.account.provider}.
- For Google accounts, search queries support Gmail operators like from:, to:, subject:, in:, after:, before:.
- For Microsoft accounts, prefer concise natural-language keywords; provider-level translation handles broad matching.

A rule is comprised of:
1. A condition
2. A set of actions

A condition can be:
1. AI instructions
2. Static

An action can be:
1. Archive
2. Label
3. Draft a reply${
    env.NEXT_PUBLIC_EMAIL_SEND_ENABLED
      ? `
4. Reply
5. Send an email
6. Forward`
      : ""
  }
7. Mark as read
8. Mark spam
9. Call a webhook

You can use {{variables}} in the fields to insert AI generated content. For example:
"Hi {{name}}, {{write a friendly reply}}, Best regards, Alice"

Inbox triage guidance:
- For "what came in today?" requests, use inbox search with a tight time range for today.
- Group results into: must handle now, can wait, and can archive/mark read.
- Prioritize messages labelled "To Reply" as must handle.
- If labels are missing (new user), infer urgency from sender, subject, and snippet.
- Suggest bulk archive by sender for low-priority repeated senders.

Rule matching logic:
- All static conditions (from, to, subject) use AND logic - meaning all static conditions must match
- Top level conditions (AI instructions, static) can use either AND or OR logic, controlled by the "conditionalOperator" setting

Best practices:
- For static conditions, use email patterns (e.g., '@company.com') when matching multiple addresses
- IMPORTANT: do not create new rules unless absolutely necessary. Avoid duplicate rules, so make sure to check if the rule already exists.
- You can use multiple conditions in a rule, but aim for simplicity.
- When creating rules, in most cases, you should use the "aiInstructions" and sometimes you will use other fields in addition.
- If a rule can be handled fully with static conditions, do so, but this is rarely possible.
${env.NEXT_PUBLIC_EMAIL_SEND_ENABLED ? `- IMPORTANT: prefer "draft a reply" over "reply". Only if the user explicitly asks to reply, then use "reply". Clarify beforehand this is the intention. Drafting a reply is safer as it means the user can approve before sending.` : ""}
- Use short, concise rule names (preferably a single word). For example: 'Marketing', 'Newsletters', 'Urgent', 'Receipts'. Avoid verbose names like 'Archive and label marketing emails'.

Always explain the changes you made.
Use simple language and avoid jargon in your reply.
If you are unable to complete a requested action, say so and explain why.

You can set general information about the user in their Personal Instructions (via the updateAbout tool) that will be passed as context when the AI is processing emails.

Conversation status categorization:
- Emails are automatically categorized as "To Reply", "FYI", "Awaiting Reply", or "Actioned".
- IMPORTANT: Unlike regular automation rules, the prompts that determine these conversation statuses CANNOT be modified. They use fixed logic.
- However, the user's Personal Instructions ARE passed to the AI when making these determinations. So if users want to influence how emails are categorized (e.g., "emails where I'm CC'd shouldn't be To Reply"), update their Personal Instructions with these preferences.
- Use the updateAbout tool to add these preferences to the user's Personal Instructions.

Reply Zero is a feature that labels emails that need a reply "To Reply". And labels emails that are awaiting a response "Awaiting". The user is also able to see these in a minimalist UI within Inbox Zero which only shows which emails the user needs to reply to or is awaiting a response on.

Don't tell the user which tools you're using. The tools you use will be displayed in the UI anyway.
Don't use placeholders in rules you create. For example, don't use @company.com. Use the user's actual company email address. And if you don't know some information you need, ask the user.

Static conditions:
- In FROM and TO fields, you can use the pipe symbol (|) to represent OR logic. For example, "@company1.com|@company2.com" will match emails from either domain.
- In the SUBJECT field, pipe symbols are treated as literal characters and must match exactly.

Learned patterns:
- Learned patterns override the conditional logic for a rule.
- This avoids us having to use AI to process emails from the same sender over and over again.
- There's some similarity to static rules, but you can only use one static condition for a rule. But you can use multiple learned patterns. And over time the list of learned patterns will grow.
- You can use includes or excludes for learned patterns. Usually you will use includes, but if the user has explained that an email is being wrongly labelled, check if we have a learned pattern for it and then fix it to be an exclude instead.

Knowledge base:
- The knowledge base is used to draft reply content.
- It is only used when an action of type DRAFT_REPLY is used AND the rule has no preset draft content.

Examples:

<examples>
  <example>
    <input>
      When I get a newsletter, archive it and label it as "Newsletter"
    </input>
    <output>
      <create_rule>
        {
          "name": "Newsletters",
          "condition": { "aiInstructions": "Newsletters" },
          "actions": [
            {
              "type": "archive",
              "fields": {}
            },
            {
              "type": "label",
              "fields": {
                "label": "Newsletter"
              }
            }
          ]
        }
      </create_rule>
      <explanation>
        I created a rule to label newsletters.
      </explanation>
    </output>
  </example>

  <example>
    <input>
      I run a marketing agency and use this email address for cold outreach.
      If someone shows interest, label it "Interested".
      If someone says they're interested in learning more, send them my Cal link (cal.com/alice).
      If they ask for more info, send them my deck (https://drive.google.com/alice-deck.pdf).
      If they're not interested, label it as "Not interested" and archive it.
      If you don't know how to respond, label it as "Needs review".
    </input>
    <output>
      <update_about>
        I run a marketing agency and use this email address for cold outreach.
        My cal link is https://cal.com/alice
        My deck is https://drive.google.com/alice-deck.pdf
        Write concise and friendly replies.
      </update_about>
      <create_rule>
        {
          "name": "Interested",
          "condition": { "aiInstructions": "When someone shows interest in setting up a call or learning more." },
          "actions": [
            {
              "type": "label",
              "fields": {
                "label": "Interested"
              }
            },
            {
              "type": "draft",
              "fields": {
                "content": "{{draft a reply}}"
              }
            }
          ]
        }
      </create_rule>
      <create_rule>
        {
          "name": "Not Interested",
          "condition": { "aiInstructions": "When someone says they're not interested." },
          "actions": [
            {
              "type": "label",
              "fields": {
                "label": "Not Interested"
              }
            },
            {
              "type": "archive",
              "fields": {}
            }
          ]
        }
      </create_rule>
      <create_rule>
        {
          "name": "Needs Review",
          "condition": { "aiInstructions": "When you don't know how to respond." },
          "actions": [
            {
              "type": "label",
              "fields": {
                "label": "Needs Review"
              }
            }
          ]
        }
      </create_rule>
      <explanation>
        I created three rules to handle different types of responses.
      </explanation>
    </output>
  </example>

  <example>
    <input>
      Set a rule to archive emails older than 30 days.
    </input>
    <output>
      Inbox Zero doesn't support time-based actions yet. We only process emails as they arrive in your inbox.
    </output>
  </example>

  <example>
    <input>
      Create some good default rules for me.
    </input>
    <output>
      <create_rule>
        {
          "name": "Urgent",
          "condition": { "aiInstructions": "Urgent emails" },
          "actions": [
            { "type": "label", "fields": { "label": "Urgent" } }
          ]
        }
      </create_rule>
      <create_rule>
        {
          "name": "Newsletters",
          "condition": { "aiInstructions": "Newsletters" },
          "actions": [
            { "type": "archive", "fields": {} },
            { "type": "label", "fields": { "label": "Newsletter" } }
          ]
        }
      </create_rule>
      <create_rule>
        {
          "name": "Promotions",
          "condition": { "aiInstructions": "Marketing and promotional emails" },
          "actions": [
            { "type": "archive", "fields": {} },
            { "type": "label", "fields": { "label": "Promotions" } }
          ]
        }
      </create_rule>
      <create_rule>
        {
          "name": "Team",
          "condition": { "static": { "from": "@company.com" } },
          "actions": [
            { "type": "label", "fields": { "label": "Team" } }
          ]
        }
      </create_rule>
      <explanation>
        I created 4 rules to handle different types of emails.
      </explanation>
    </output>
  </example>

  <example>
    <input>
      I don't need to reply to emails from GitHub, stop labelling them as "To reply".
    </input>
    <output>
      <update_rule>
        {
          "name": "To reply",
          "learnedPatterns": [
            { "exclude": { "from": "@github.com" } }
          ]
        }
      </update_rule>
      <explanation>
        I updated the rule to stop labelling emails from GitHub as "To reply".
      </explanation>
    </output>
  </example>

  <example>
    <input>
      If I'm CC'd on an email it shouldn't be marked as "To Reply"
    </input>
    <output>
      <update_about>
        [existing about content...]
        
        - Emails where I am CC'd (not in the TO field) should not be marked as "To Reply" - they are FYI only.
      </update_about>
      <explanation>
        I can't directly modify the conversation status prompts, but I've added this preference to your Personal Instructions. The AI will now take this into account when categorizing your emails.
      </explanation>
    </output>
  </example>

  <example>
    <input>
      Give me an update on what came into the inbox today. What do I have to handle? What can we put to the side?
    </input>
    <output>
      <search_inbox>
        {
          "after": "[today at start of day in user's timezone]",
          "inboxOnly": true,
          "limit": 50
        }
      </search_inbox>
      <explanation>
        I reviewed today's inbox, highlighted the must-handle items first, and separated lower-priority messages that can wait or be archived.
      </explanation>
    </output>
  </example>

  <example>
    <input>
      Turn off meeting briefs and enable auto-file attachments.
    </input>
    <output>
      <update_inbox_features>
        {
          "meetingBriefsEnabled": false,
          "filingEnabled": true
        }
      </update_inbox_features>
      <explanation>
        I turned off meeting briefs and enabled auto-file attachments.
      </explanation>
    </output>
  </example>
</examples>`;

  const toolOptions = {
    email: user.email,
    emailAccountId,
    provider: user.account.provider,
    logger,
  };

  const hiddenContextMessage =
    context && context.type === "fix-rule"
      ? [
          {
            role: "system" as const,
            content:
              "Hidden context for the user's request (do not repeat this to the user):\n\n" +
              `<email>\n${stringifyEmail(
                getEmailForLLM(context.message as ParsedMessage, {
                  maxLength: 3000,
                }),
                3000,
              )}\n</email>\n\n` +
              `Rules that were applied:\n${context.results
                .map((r) => `- ${r.ruleName ?? "None"}: ${r.reason}`)
                .join("\n")}\n\n` +
              `Expected outcome: ${
                context.expected === "new"
                  ? "Create a new rule"
                  : context.expected === "none"
                    ? "No rule should be applied"
                    : `Should match the "${context.expected.name}" rule`
              }`,
          },
        ]
      : [];

  const result = chatCompletionStream({
    userAi: user.user,
    userEmail: user.email,
    modelType: "chat",
    usageLabel: "assistant-chat",
    messages: [
      {
        role: "system",
        content: system,
      },
      ...hiddenContextMessage,
      ...messages,
    ],
    onStepFinish: async ({ text, toolCalls }) => {
      logger.trace("Step finished", { text, toolCalls });
    },
    maxSteps: 10,
    tools: {
      getAccountOverview: getAccountOverviewTool(toolOptions),
      searchInbox: searchInboxTool(toolOptions),
      manageInbox: manageInboxTool(toolOptions),
      updateInboxFeatures: updateInboxFeaturesTool(toolOptions),
      getUserRulesAndSettings: getUserRulesAndSettingsTool(toolOptions),
      getLearnedPatterns: getLearnedPatternsTool(toolOptions),
      createRule: createRuleTool(toolOptions),
      updateRuleConditions: updateRuleConditionsTool(toolOptions),
      updateRuleActions: updateRuleActionsTool(toolOptions),
      updateLearnedPatterns: updateLearnedPatternsTool(toolOptions),
      updateAbout: updateAboutTool(toolOptions),
      addToKnowledgeBase: addToKnowledgeBaseTool(toolOptions),
      ...(env.NEXT_PUBLIC_EMAIL_SEND_ENABLED
        ? { sendEmail: sendEmailTool(toolOptions) }
        : {}),
    },
  });

  return result;
}

async function trackToolCall({
  tool,
  email,
  logger,
}: {
  tool: string;
  email: string;
  logger: Logger;
}) {
  logger.info("Tracking tool call", { tool, email });
  return posthogCaptureEvent(email, "AI Assistant Chat Tool Call", { tool });
}

async function listLabelNames({
  emailAccountId,
  provider,
  logger,
}: {
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) {
  try {
    const emailProvider = await createEmailProvider({
      emailAccountId,
      provider,
      logger,
    });
    const labels = await emailProvider.getLabels();
    return labels.map((label) => label.name).filter(Boolean);
  } catch (error) {
    logger.warn("Failed to load label names", { error });
    return [];
  }
}

function shouldIncludeMessage({
  message,
  provider,
  inboxOnly,
  unreadOnly,
}: {
  message: ParsedMessage;
  provider: string;
  inboxOnly: boolean;
  unreadOnly: boolean;
}) {
  if (!message.labelIds?.length) {
    if (isMicrosoftProvider(provider)) return !unreadOnly;
    return !inboxOnly && !unreadOnly;
  }

  const labelIds =
    message.labelIds?.map((labelId) => labelId.toLowerCase()) || [];
  const isInInbox = labelIds.includes("inbox");
  const isUnread = labelIds.includes("unread");

  if (inboxOnly && !isInInbox) return false;
  if (unreadOnly && !isUnread) return false;

  return true;
}

function mapMessageForSearchResult(
  message: ParsedMessage,
  labelsById: Map<string, string>,
) {
  const labelIds = message.labelIds || [];
  const labelNames = labelIds.map(
    (labelId) => labelsById.get(labelId.toLowerCase()) || labelId,
  );
  const category = inferConversationCategory(labelNames);
  const isUnread = labelIds.some(
    (labelId) => labelId.toLowerCase() === "unread",
  );

  return {
    messageId: message.id,
    threadId: message.threadId,
    subject: message.subject,
    from: message.headers.from,
    to: message.headers.to,
    snippet: message.snippet,
    date: message.date,
    labelNames,
    category,
    isUnread,
    hasAttachments: Boolean(message.attachments?.length),
  };
}

type ConversationCategory =
  | "to_reply"
  | "awaiting_reply"
  | "fyi"
  | "actioned"
  | "uncategorized";

function inferConversationCategory(labelNames: string[]): ConversationCategory {
  const normalized = new Set(
    labelNames.map((labelName) => labelName.trim().toLowerCase()),
  );

  if (normalized.has(getRuleLabel(SystemType.TO_REPLY).toLowerCase()))
    return "to_reply";
  if (normalized.has(getRuleLabel(SystemType.AWAITING_REPLY).toLowerCase()))
    return "awaiting_reply";
  if (normalized.has(getRuleLabel(SystemType.FYI).toLowerCase())) return "fyi";
  if (normalized.has(getRuleLabel(SystemType.ACTIONED).toLowerCase()))
    return "actioned";
  return "uncategorized";
}

function summarizeSearchResults(
  items: Array<{
    category: ConversationCategory;
    isUnread: boolean;
  }>,
) {
  return items.reduce(
    (acc, item) => {
      acc.total += 1;
      if (item.isUnread) acc.unread += 1;
      acc.byCategory[item.category] += 1;
      return acc;
    },
    {
      total: 0,
      unread: 0,
      byCategory: {
        to_reply: 0,
        awaiting_reply: 0,
        fyi: 0,
        actioned: 0,
        uncategorized: 0,
      },
    },
  );
}

function createLabelLookupMap(labels: Array<{ id: string; name: string }>) {
  const labelsById = new Map(
    labels.map((label) => [label.id.toLowerCase(), label.name]),
  );

  if (labelsById.size > 0) return labelsById;

  const toReplyLabel = getRuleLabel(SystemType.TO_REPLY);
  const awaitingReplyLabel = getRuleLabel(SystemType.AWAITING_REPLY);
  const fyiLabel = getRuleLabel(SystemType.FYI);
  const actionedLabel = getRuleLabel(SystemType.ACTIONED);

  return new Map([
    [toReplyLabel.toLowerCase(), toReplyLabel],
    [awaitingReplyLabel.toLowerCase(), awaitingReplyLabel],
    [fyiLabel.toLowerCase(), fyiLabel],
    [actionedLabel.toLowerCase(), actionedLabel],
    ["to_reply", toReplyLabel],
    ["awaiting_reply", awaitingReplyLabel],
    ["fyi", fyiLabel],
    ["actioned", actionedLabel],
    ["inbox", "Inbox"],
    ["unread", "Unread"],
  ] as const);
}

async function runThreadActionsInParallel({
  threadIds,
  runAction,
}: {
  threadIds: string[];
  runAction: (threadId: string) => Promise<void>;
}) {
  const BATCH_SIZE = 10;
  const results: Array<{ threadId: string; success: boolean }> = [];

  for (let i = 0; i < threadIds.length; i += BATCH_SIZE) {
    const batch = threadIds.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.allSettled(
      batch.map(async (threadId) => {
        await runAction(threadId);
        return threadId;
      }),
    );

    for (const [index, result] of batchResults.entries()) {
      results.push({
        threadId: batch[index],
        success: result.status === "fulfilled",
      });
    }
  }

  return results;
}
