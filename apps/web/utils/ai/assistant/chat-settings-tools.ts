import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { posthogCaptureEvent } from "@/utils/posthog";
import { ActionType, MessagingProvider } from "@/generated/prisma/enums";
import { describeCronSchedule } from "@/utils/automation-jobs/describe";
import {
  DEFAULT_AUTOMATION_JOB_CRON,
  getDefaultAutomationJobName,
} from "@/utils/automation-jobs/defaults";
import {
  getNextAutomationJobRunAt,
  validateAutomationCronExpression,
} from "@/utils/automation-jobs/cron";

const emptyInputSchema = z.object({}).describe("No parameters required");

const scheduledCheckInsConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    cronExpression: z.string().trim().min(1).optional(),
    messagingChannelId: z.string().cuid().optional(),
    prompt: z.string().max(4000).nullable().optional(),
  })
  .refine(
    (value) =>
      value.enabled !== undefined ||
      value.cronExpression !== undefined ||
      value.messagingChannelId !== undefined ||
      value.prompt !== undefined,
    { message: "At least one scheduled check-ins field must be provided." },
  );

const draftKnowledgeUpsertSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(20_000),
});

const settingsPathSchema = z.enum([
  "assistant.personalInstructions.about",
  "assistant.multiRuleSelection.enabled",
  "assistant.meetingBriefs.enabled",
  "assistant.meetingBriefs.minutesBefore",
  "assistant.meetingBriefs.sendEmail",
  "assistant.attachmentFiling.enabled",
  "assistant.attachmentFiling.prompt",
  "assistant.scheduledCheckIns.config",
  "assistant.draftKnowledgeBase.upsert",
  "assistant.draftKnowledgeBase.delete",
]);

const settingsChangeSchema = z.discriminatedUnion("path", [
  z.object({
    path: z.literal("assistant.personalInstructions.about"),
    value: z.string().max(20_000),
    mode: z
      .enum(["append", "replace"])
      .default("append")
      .describe(
        "How to update about. append adds to existing content, replace overwrites.",
      ),
  }),
  z.object({
    path: z.literal("assistant.multiRuleSelection.enabled"),
    value: z.boolean(),
  }),
  z.object({
    path: z.literal("assistant.meetingBriefs.enabled"),
    value: z.boolean(),
  }),
  z.object({
    path: z.literal("assistant.meetingBriefs.minutesBefore"),
    value: z.number().int().min(1).max(2880),
  }),
  z.object({
    path: z.literal("assistant.meetingBriefs.sendEmail"),
    value: z.boolean(),
  }),
  z.object({
    path: z.literal("assistant.attachmentFiling.enabled"),
    value: z.boolean(),
  }),
  z.object({
    path: z.literal("assistant.attachmentFiling.prompt"),
    value: z.string().max(6000).nullable(),
  }),
  z.object({
    path: z.literal("assistant.scheduledCheckIns.config"),
    value: scheduledCheckInsConfigSchema,
  }),
  z.object({
    path: z.literal("assistant.draftKnowledgeBase.upsert"),
    value: draftKnowledgeUpsertSchema,
    mode: z
      .enum(["replace", "append"])
      .default("replace")
      .describe("Use append to add to existing content by title."),
  }),
  z.object({
    path: z.literal("assistant.draftKnowledgeBase.delete"),
    value: z.object({
      title: z.string().trim().min(1).max(200),
    }),
  }),
]);

const updateAssistantSettingsInputSchema = z.object({
  dryRun: z
    .boolean()
    .default(false)
    .describe("If true, return the change preview without applying updates."),
  changes: z
    .array(settingsChangeSchema)
    .min(1)
    .max(20)
    .describe("Structured settings changes to apply."),
});

type AccountSettingsSnapshot = {
  id: string;
  email: string;
  timezone: string | null;
  about: string | null;
  multiRuleSelectionEnabled: boolean;
  meetingBriefingsEnabled: boolean;
  meetingBriefingsMinutesBefore: number;
  meetingBriefsSendEmail: boolean;
  filingEnabled: boolean;
  filingPrompt: string | null;
  writingStyle: string | null;
  signature: string | null;
  includeReferralSignature: boolean;
  followUpAwaitingReplyDays: number | null;
  followUpNeedsReplyDays: number | null;
  followUpAutoDraftEnabled: boolean;
  digest: {
    enabled: boolean;
    schedule: {
      intervalDays: number;
      occurrences: number;
      daysOfWeek: number;
      timeOfDay: string;
      nextOccurrenceAt: string | null;
    } | null;
    includedRules: Array<{
      name: string;
      systemType: string | null;
      enabled: boolean;
    }>;
  };
  scheduledCheckIns: {
    jobId: string | null;
    enabled: boolean;
    cronExpression: string | null;
    scheduleDescription: string | null;
    prompt: string | null;
    nextRunAt: string | null;
    messagingChannelId: string | null;
    messagingChannelName: string | null;
    availableChannels: Array<{
      id: string;
      label: string;
    }>;
  };
  draftKnowledgeBase: {
    totalItems: number;
    items: Array<{
      id: string;
      title: string;
      content: string;
      updatedAt: string;
    }>;
  };
};

const readOnlyCapabilities = [
  {
    path: "assistant.writingStyle",
    title: "Writing style",
    reason:
      "Readable in chat, but writes are not yet exposed through updateAssistantSettings.",
  },
  {
    path: "assistant.signature",
    title: "Personal signature",
    reason:
      "Readable in chat, but writes are not yet exposed through updateAssistantSettings.",
  },
  {
    path: "assistant.referralSignature.enabled",
    title: "Referral signature",
    reason:
      "Readable in chat, but writes are not yet exposed through updateAssistantSettings.",
  },
  {
    path: "assistant.followUp.awaitingReplyDays",
    title: "Follow-up (awaiting reply days)",
    reason:
      "Readable in chat, but writes are not yet exposed through updateAssistantSettings.",
  },
  {
    path: "assistant.followUp.needsReplyDays",
    title: "Follow-up (needs reply days)",
    reason:
      "Readable in chat, but writes are not yet exposed through updateAssistantSettings.",
  },
  {
    path: "assistant.followUp.autoDraftEnabled",
    title: "Follow-up auto-draft",
    reason:
      "Readable in chat, but writes are not yet exposed through updateAssistantSettings.",
  },
  {
    path: "assistant.digest",
    title: "Digest configuration",
    reason:
      "Readable in chat, but writes are not yet exposed through updateAssistantSettings.",
  },
] as const;

export const getAssistantCapabilitiesTool = ({
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
      "Get a capability snapshot showing which assistant/account settings can be read or updated from chat.",
    inputSchema: emptyInputSchema,
    execute: async () => {
      trackToolCall({ tool: "get_assistant_capabilities", email, logger });

      const snapshot = await loadAccountSettingsSnapshot(emailAccountId);
      if (!snapshot) return { error: "Email account not found" };

      return {
        snapshotVersion: "2026-02-20",
        account: {
          email: snapshot.email,
          provider,
          timezone: snapshot.timezone,
        },
        capabilities: [
          ...getWritableCapabilities(snapshot),
          ...getReadOnlyCapabilities(snapshot),
        ],
        writablePaths: settingsPathSchema.options,
      };
    },
  });

export type GetAssistantCapabilitiesTool = InferUITool<
  ReturnType<typeof getAssistantCapabilitiesTool>
>;

export const updateAssistantSettingsTool = ({
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
      "Update supported assistant settings using a structured patch. Use getAssistantCapabilities first when unsure.",
    inputSchema: updateAssistantSettingsInputSchema,
    execute: async ({ changes, dryRun }) => {
      trackToolCall({ tool: "update_assistant_settings", email, logger });

      const existing = await loadAccountSettingsSnapshot(emailAccountId);
      if (!existing) return { error: "Email account not found" };

      const normalizedChanges = dedupeSettingsChanges(changes);
      const data: {
        about?: string;
        multiRuleSelectionEnabled?: boolean;
        meetingBriefingsEnabled?: boolean;
        meetingBriefingsMinutesBefore?: number;
        meetingBriefsSendEmail?: boolean;
        filingEnabled?: boolean;
        filingPrompt?: string | null;
      } = {};
      let scheduledCheckInsConfig: {
        enabled: boolean;
        cronExpression: string | null;
        messagingChannelId: string | null;
        prompt: string | null;
      } | null = null;
      const knowledgeOperations: Array<
        | {
            type: "upsert";
            title: string;
            content: string;
          }
        | {
            type: "delete";
            title: string;
          }
      > = [];
      const appliedChanges: Array<{
        path: z.infer<typeof settingsPathSchema>;
        previous: unknown;
        next: unknown;
      }> = [];
      const draftKnowledgeByTitle = new Map(
        existing.draftKnowledgeBase.items.map((item) => [item.title, item]),
      );

      for (const change of normalizedChanges) {
        if (change.path === "assistant.draftKnowledgeBase.upsert") {
          const existingItem = draftKnowledgeByTitle.get(change.value.title);
          const nextContent = resolveKnowledgeContent({
            existingContent: existingItem?.content ?? null,
            incomingContent: change.value.content,
            mode: change.mode,
          });

          if (existingItem?.content === nextContent) continue;

          appliedChanges.push({
            path: change.path,
            previous: existingItem
              ? {
                  title: existingItem.title,
                  contentLength: existingItem.content.length,
                }
              : null,
            next: {
              title: change.value.title,
              contentLength: nextContent.length,
            },
          });

          draftKnowledgeByTitle.set(change.value.title, {
            id: existingItem?.id ?? "",
            title: change.value.title,
            content: nextContent,
            updatedAt: new Date().toISOString(),
          });

          knowledgeOperations.push({
            type: "upsert",
            title: change.value.title,
            content: nextContent,
          });
          continue;
        }

        if (change.path === "assistant.draftKnowledgeBase.delete") {
          const existingItem = draftKnowledgeByTitle.get(change.value.title);
          if (!existingItem) continue;

          appliedChanges.push({
            path: change.path,
            previous: {
              title: existingItem.title,
              contentLength: existingItem.content.length,
            },
            next: null,
          });

          draftKnowledgeByTitle.delete(change.value.title);
          knowledgeOperations.push({
            type: "delete",
            title: change.value.title,
          });
          continue;
        }

        const previousValue = getCurrentValue({
          snapshot: existing,
          path: change.path,
        });
        let resolvedNextValue: unknown;

        try {
          resolvedNextValue = resolveNextValue({
            snapshot: existing,
            change,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return { error: message };
        }

        if (areValuesEqual(previousValue, resolvedNextValue)) continue;

        appliedChanges.push({
          path: change.path,
          previous: previousValue,
          next: resolvedNextValue,
        });

        switch (change.path) {
          case "assistant.personalInstructions.about":
            data.about = resolvedNextValue as string;
            break;
          case "assistant.multiRuleSelection.enabled":
            data.multiRuleSelectionEnabled = resolvedNextValue as boolean;
            break;
          case "assistant.meetingBriefs.enabled":
            data.meetingBriefingsEnabled = resolvedNextValue as boolean;
            break;
          case "assistant.meetingBriefs.minutesBefore":
            data.meetingBriefingsMinutesBefore = resolvedNextValue as number;
            break;
          case "assistant.meetingBriefs.sendEmail":
            data.meetingBriefsSendEmail = resolvedNextValue as boolean;
            break;
          case "assistant.attachmentFiling.enabled":
            data.filingEnabled = resolvedNextValue as boolean;
            break;
          case "assistant.attachmentFiling.prompt":
            data.filingPrompt = resolvedNextValue as string | null;
            break;
          case "assistant.scheduledCheckIns.config":
            scheduledCheckInsConfig = resolvedNextValue as {
              enabled: boolean;
              cronExpression: string | null;
              messagingChannelId: string | null;
              prompt: string | null;
            };
            break;
        }
      }

      if (appliedChanges.length === 0) {
        return {
          success: true,
          dryRun,
          message: "No setting changes were needed.",
          appliedChanges: [],
        };
      }

      if (!dryRun) {
        if (Object.keys(data).length > 0) {
          await prisma.emailAccount.update({
            where: { id: emailAccountId },
            data,
          });
        }

        if (scheduledCheckInsConfig) {
          await applyScheduledCheckInsConfig({
            emailAccountId,
            current: existing.scheduledCheckIns,
            config: scheduledCheckInsConfig,
          });
        }

        for (const operation of knowledgeOperations) {
          if (operation.type === "upsert") {
            await prisma.knowledge.upsert({
              where: {
                emailAccountId_title: {
                  emailAccountId,
                  title: operation.title,
                },
              },
              create: {
                emailAccountId,
                title: operation.title,
                content: operation.content,
              },
              update: {
                content: operation.content,
              },
            });
            continue;
          }

          await prisma.knowledge.deleteMany({
            where: {
              emailAccountId,
              title: operation.title,
            },
          });
        }
      }

      return {
        success: true,
        dryRun,
        appliedChanges,
      };
    },
  });

export type UpdateAssistantSettingsTool = InferUITool<
  ReturnType<typeof updateAssistantSettingsTool>
>;

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

function dedupeSettingsChanges(
  changes: Array<z.infer<typeof settingsChangeSchema>>,
) {
  const nonDedupablePaths = new Set<z.infer<typeof settingsPathSchema>>([
    "assistant.draftKnowledgeBase.upsert",
    "assistant.draftKnowledgeBase.delete",
  ]);
  const seen = new Set<z.infer<typeof settingsPathSchema>>();
  const dedupedReversed: Array<z.infer<typeof settingsChangeSchema>> = [];

  for (let i = changes.length - 1; i >= 0; i--) {
    const change = changes[i];
    if (nonDedupablePaths.has(change.path)) {
      dedupedReversed.push(change);
      continue;
    }

    if (seen.has(change.path)) continue;
    seen.add(change.path);
    dedupedReversed.push(change);
  }

  return dedupedReversed.reverse();
}

function resolveNextValue({
  snapshot,
  change,
}: {
  snapshot: AccountSettingsSnapshot;
  change: z.infer<typeof settingsChangeSchema>;
}) {
  if (change.path === "assistant.scheduledCheckIns.config") {
    return resolveScheduledCheckInsConfig({
      snapshot: snapshot.scheduledCheckIns,
      change: change.value,
    });
  }

  if (change.path === "assistant.personalInstructions.about") {
    if (change.mode === "replace") {
      return change.value;
    }

    const existing = snapshot.about?.trim();
    const incoming = change.value.trim();
    if (!incoming) return snapshot.about ?? "";
    if (!existing) return incoming;
    if (existing === incoming) return snapshot.about ?? "";
    return `${snapshot.about}\n${incoming}`;
  }

  return change.value;
}

function getCurrentValue({
  snapshot,
  path,
}: {
  snapshot: AccountSettingsSnapshot;
  path: z.infer<typeof settingsPathSchema>;
}) {
  switch (path) {
    case "assistant.personalInstructions.about":
      return snapshot.about ?? "";
    case "assistant.multiRuleSelection.enabled":
      return snapshot.multiRuleSelectionEnabled;
    case "assistant.meetingBriefs.enabled":
      return snapshot.meetingBriefingsEnabled;
    case "assistant.meetingBriefs.minutesBefore":
      return snapshot.meetingBriefingsMinutesBefore;
    case "assistant.meetingBriefs.sendEmail":
      return snapshot.meetingBriefsSendEmail;
    case "assistant.attachmentFiling.enabled":
      return snapshot.filingEnabled;
    case "assistant.attachmentFiling.prompt":
      return snapshot.filingPrompt;
    case "assistant.scheduledCheckIns.config":
      return {
        enabled: snapshot.scheduledCheckIns.enabled,
        cronExpression: snapshot.scheduledCheckIns.cronExpression,
        messagingChannelId: snapshot.scheduledCheckIns.messagingChannelId,
        prompt: snapshot.scheduledCheckIns.prompt,
      };
    case "assistant.draftKnowledgeBase.upsert":
    case "assistant.draftKnowledgeBase.delete":
      return null;
  }
}

function getWritableCapabilities(snapshot: AccountSettingsSnapshot) {
  return [
    {
      path: "assistant.personalInstructions.about",
      title: "Personal instructions",
      canRead: true,
      canWrite: true,
      value: snapshot.about ?? "",
    },
    {
      path: "assistant.multiRuleSelection.enabled",
      title: "Multi-rule selection",
      canRead: true,
      canWrite: true,
      value: snapshot.multiRuleSelectionEnabled,
    },
    {
      path: "assistant.meetingBriefs.enabled",
      title: "Meeting briefs enabled",
      canRead: true,
      canWrite: true,
      value: snapshot.meetingBriefingsEnabled,
    },
    {
      path: "assistant.meetingBriefs.minutesBefore",
      title: "Meeting briefs minutes before",
      canRead: true,
      canWrite: true,
      value: snapshot.meetingBriefingsMinutesBefore,
    },
    {
      path: "assistant.meetingBriefs.sendEmail",
      title: "Meeting briefs email delivery",
      canRead: true,
      canWrite: true,
      value: snapshot.meetingBriefsSendEmail,
    },
    {
      path: "assistant.attachmentFiling.enabled",
      title: "Auto-file attachments enabled",
      canRead: true,
      canWrite: true,
      value: snapshot.filingEnabled,
    },
    {
      path: "assistant.attachmentFiling.prompt",
      title: "Auto-file attachments prompt",
      canRead: true,
      canWrite: true,
      value: snapshot.filingPrompt,
    },
    {
      path: "assistant.scheduledCheckIns",
      title: "Scheduled check-ins",
      canRead: true,
      canWrite: true,
      value: snapshot.scheduledCheckIns,
      writePaths: ["assistant.scheduledCheckIns.config"],
    },
    {
      path: "assistant.draftKnowledgeBase",
      title: "Draft knowledge base",
      canRead: true,
      canWrite: true,
      value: {
        totalItems: snapshot.draftKnowledgeBase.totalItems,
        items: snapshot.draftKnowledgeBase.items.map((item) => ({
          id: item.id,
          title: item.title,
          updatedAt: item.updatedAt,
        })),
      },
      writePaths: [
        "assistant.draftKnowledgeBase.upsert",
        "assistant.draftKnowledgeBase.delete",
      ],
    },
  ] as const;
}

function getReadOnlyCapabilities(snapshot: AccountSettingsSnapshot) {
  return readOnlyCapabilities.map((capability) => ({
    ...capability,
    canRead: true,
    canWrite: false,
    value: getReadOnlyValue({
      snapshot,
      path: capability.path,
    }),
  }));
}

function getReadOnlyValue({
  snapshot,
  path,
}: {
  snapshot: AccountSettingsSnapshot;
  path: (typeof readOnlyCapabilities)[number]["path"];
}) {
  switch (path) {
    case "assistant.writingStyle":
      return snapshot.writingStyle;
    case "assistant.signature":
      return snapshot.signature;
    case "assistant.referralSignature.enabled":
      return snapshot.includeReferralSignature;
    case "assistant.followUp.awaitingReplyDays":
      return snapshot.followUpAwaitingReplyDays;
    case "assistant.followUp.needsReplyDays":
      return snapshot.followUpNeedsReplyDays;
    case "assistant.followUp.autoDraftEnabled":
      return snapshot.followUpAutoDraftEnabled;
    case "assistant.digest":
      return snapshot.digest;
  }
}

function areValuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function resolveKnowledgeContent({
  existingContent,
  incomingContent,
  mode,
}: {
  existingContent: string | null;
  incomingContent: string;
  mode: "replace" | "append";
}) {
  if (mode === "replace") return incomingContent;

  const existing = existingContent?.trim();
  const incoming = incomingContent.trim();
  if (!incoming) return existingContent ?? "";
  if (!existing) return incoming;
  if (existing === incoming) return existingContent ?? "";
  return `${existingContent}\n${incoming}`;
}

function resolveScheduledCheckInsConfig({
  snapshot,
  change,
}: {
  snapshot: AccountSettingsSnapshot["scheduledCheckIns"];
  change: z.infer<typeof scheduledCheckInsConfigSchema>;
}) {
  const enabled = change.enabled ?? snapshot.enabled;
  const cronExpression =
    change.cronExpression?.trim() ||
    snapshot.cronExpression ||
    (enabled ? DEFAULT_AUTOMATION_JOB_CRON : null);
  const prompt =
    change.prompt === undefined
      ? snapshot.prompt
      : normalizePrompt(change.prompt);

  let messagingChannelId =
    change.messagingChannelId ?? snapshot.messagingChannelId ?? null;

  if (enabled && !messagingChannelId) {
    messagingChannelId = snapshot.availableChannels[0]?.id ?? null;
  }

  if (enabled && !messagingChannelId) {
    throw new Error("Connect Slack before enabling scheduled check-ins.");
  }

  if (
    enabled &&
    messagingChannelId &&
    !snapshot.availableChannels.some(
      (channel) => channel.id === messagingChannelId,
    )
  ) {
    throw new Error(
      "Selected Slack channel is unavailable. Refresh capabilities and choose another channel.",
    );
  }

  if (enabled && !cronExpression) {
    throw new Error(
      "Invalid schedule. Please provide a valid cron expression.",
    );
  }

  if (enabled && cronExpression) {
    validateAutomationCronExpression(cronExpression);
  }

  return {
    enabled,
    cronExpression,
    messagingChannelId,
    prompt,
  };
}

function normalizePrompt(prompt: string | null) {
  const normalized = prompt?.trim();
  return normalized ? normalized : null;
}

async function applyScheduledCheckInsConfig({
  emailAccountId,
  current,
  config,
}: {
  emailAccountId: string;
  current: AccountSettingsSnapshot["scheduledCheckIns"];
  config: {
    enabled: boolean;
    cronExpression: string | null;
    messagingChannelId: string | null;
    prompt: string | null;
  };
}) {
  const cronExpression = config.cronExpression ?? DEFAULT_AUTOMATION_JOB_CRON;

  if (!current.jobId) {
    if (!config.enabled || !config.messagingChannelId) return;

    await prisma.automationJob.create({
      data: {
        name: getDefaultAutomationJobName(),
        emailAccountId,
        enabled: true,
        cronExpression,
        prompt: config.prompt,
        messagingChannelId: config.messagingChannelId,
        nextRunAt: getNextAutomationJobRunAt({
          cronExpression,
          fromDate: new Date(),
        }),
      },
    });
    return;
  }

  const nextRunAt =
    config.enabled &&
    getNextAutomationJobRunAt({
      cronExpression,
      fromDate: new Date(),
    });

  await prisma.automationJob.update({
    where: { id: current.jobId },
    data: {
      enabled: config.enabled,
      cronExpression,
      prompt: config.prompt,
      ...(config.messagingChannelId && {
        messagingChannelId: config.messagingChannelId,
      }),
      ...(nextRunAt && { nextRunAt }),
    },
  });
}

function buildScheduledCheckInsSnapshot(
  emailAccount: NonNullable<
    Awaited<ReturnType<typeof loadAccountSettingsSnapshotRaw>>
  >,
) {
  const availableChannels = emailAccount.messagingChannels
    .filter(
      (channel) =>
        channel.isConnected &&
        Boolean(channel.accessToken) &&
        Boolean(channel.providerUserId || channel.channelId),
    )
    .map((channel) => ({
      id: channel.id,
      label: formatSlackChannelLabel({
        channelName: channel.channelName,
        teamName: channel.teamName,
      }),
    }));

  return {
    jobId: emailAccount.automationJob?.id ?? null,
    enabled: Boolean(emailAccount.automationJob?.enabled),
    cronExpression: emailAccount.automationJob?.cronExpression ?? null,
    scheduleDescription: emailAccount.automationJob
      ? describeCronSchedule(emailAccount.automationJob.cronExpression)
      : null,
    prompt: emailAccount.automationJob?.prompt ?? null,
    nextRunAt: emailAccount.automationJob?.nextRunAt.toISOString() ?? null,
    messagingChannelId: emailAccount.automationJob?.messagingChannelId ?? null,
    messagingChannelName: emailAccount.automationJob?.messagingChannel
      ? formatSlackChannelLabel({
          channelName: emailAccount.automationJob.messagingChannel.channelName,
          teamName: emailAccount.automationJob.messagingChannel.teamName,
        })
      : null,
    availableChannels,
  };
}

function formatSlackChannelLabel({
  channelName,
  teamName,
}: {
  channelName: string | null;
  teamName: string | null;
}) {
  if (channelName && teamName) return `#${channelName} (${teamName})`;
  if (channelName) return `#${channelName}`;
  return teamName || "Slack destination";
}

async function loadAccountSettingsSnapshot(emailAccountId: string) {
  const emailAccount = await loadAccountSettingsSnapshotRaw(emailAccountId);

  if (!emailAccount) return null;

  return {
    id: emailAccount.id,
    email: emailAccount.email,
    timezone: emailAccount.timezone,
    about: emailAccount.about,
    multiRuleSelectionEnabled: emailAccount.multiRuleSelectionEnabled,
    meetingBriefingsEnabled: emailAccount.meetingBriefingsEnabled,
    meetingBriefingsMinutesBefore: emailAccount.meetingBriefingsMinutesBefore,
    meetingBriefsSendEmail: emailAccount.meetingBriefsSendEmail,
    filingEnabled: emailAccount.filingEnabled,
    filingPrompt: emailAccount.filingPrompt,
    writingStyle: emailAccount.writingStyle,
    signature: emailAccount.signature,
    includeReferralSignature: emailAccount.includeReferralSignature,
    followUpAwaitingReplyDays: emailAccount.followUpAwaitingReplyDays,
    followUpNeedsReplyDays: emailAccount.followUpNeedsReplyDays,
    followUpAutoDraftEnabled: emailAccount.followUpAutoDraftEnabled,
    digest: {
      enabled: Boolean(emailAccount.digestSchedule),
      schedule: emailAccount.digestSchedule
        ? {
            intervalDays: emailAccount.digestSchedule.intervalDays,
            occurrences: emailAccount.digestSchedule.occurrences,
            daysOfWeek: emailAccount.digestSchedule.daysOfWeek,
            timeOfDay: emailAccount.digestSchedule.timeOfDay.toISOString(),
            nextOccurrenceAt:
              emailAccount.digestSchedule.nextOccurrenceAt?.toISOString() ??
              null,
          }
        : null,
      includedRules: emailAccount.rules
        .filter((rule) => rule.actions.length > 0)
        .map((rule) => ({
          name: rule.name,
          systemType: rule.systemType,
          enabled: rule.enabled,
        })),
    },
    scheduledCheckIns: buildScheduledCheckInsSnapshot(emailAccount),
    draftKnowledgeBase: {
      totalItems: emailAccount.knowledge.length,
      items: emailAccount.knowledge.map((item) => ({
        id: item.id,
        title: item.title,
        content: item.content,
        updatedAt: item.updatedAt.toISOString(),
      })),
    },
  } satisfies AccountSettingsSnapshot;
}

async function loadAccountSettingsSnapshotRaw(emailAccountId: string) {
  return prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      id: true,
      email: true,
      timezone: true,
      about: true,
      multiRuleSelectionEnabled: true,
      meetingBriefingsEnabled: true,
      meetingBriefingsMinutesBefore: true,
      meetingBriefsSendEmail: true,
      filingEnabled: true,
      filingPrompt: true,
      writingStyle: true,
      signature: true,
      includeReferralSignature: true,
      followUpAwaitingReplyDays: true,
      followUpNeedsReplyDays: true,
      followUpAutoDraftEnabled: true,
      digestSchedule: {
        select: {
          id: true,
          intervalDays: true,
          occurrences: true,
          daysOfWeek: true,
          timeOfDay: true,
          nextOccurrenceAt: true,
        },
      },
      rules: {
        select: {
          name: true,
          systemType: true,
          enabled: true,
          actions: {
            where: { type: ActionType.DIGEST },
            select: { id: true },
          },
        },
      },
      automationJob: {
        select: {
          id: true,
          enabled: true,
          cronExpression: true,
          prompt: true,
          nextRunAt: true,
          messagingChannelId: true,
          messagingChannel: {
            select: {
              channelName: true,
              teamName: true,
            },
          },
        },
      },
      messagingChannels: {
        where: { provider: MessagingProvider.SLACK },
        select: {
          id: true,
          channelName: true,
          teamName: true,
          isConnected: true,
          accessToken: true,
          providerUserId: true,
          channelId: true,
        },
      },
      knowledge: {
        select: {
          id: true,
          title: true,
          content: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
}
