import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { posthogCaptureEvent } from "@/utils/posthog";
import {
  ActionType,
  MessagingProvider,
  MessagingRoutePurpose,
} from "@/generated/prisma/enums";
import { describeCronSchedule } from "@/utils/automation-jobs/describe";
import { DEFAULT_AUTOMATION_JOB_CRON } from "@/utils/automation-jobs/defaults";
import { SUPPORTED_AUTOMATION_MESSAGING_PROVIDERS } from "@/utils/automation-jobs/messaging-channel";
import {
  formatRouteTargetLabel,
  getMessagingRoute,
  hasMessagingRoute,
} from "@/utils/messaging/routes";
import {
  getNextAutomationJobRunAt,
  validateAutomationCronExpression,
} from "@/utils/automation-jobs/cron";
import {
  canEnableAutomationJobs,
  createAutomationJob,
} from "@/utils/actions/automation-jobs.helpers";

const scheduledCheckInsConfigSchema = z
  .object({
    enabled: z
      .boolean()
      .nullish()
      .describe("Whether scheduled check-ins are enabled."),
    cronExpression: z
      .string()
      .trim()
      .min(1)
      .nullish()
      .describe("Cron expression for the scheduled check-in cadence."),
    messagingChannelId: z
      .string()
      .cuid()
      .nullish()
      .describe("Messaging channel ID to deliver scheduled check-ins to."),
    prompt: z
      .string()
      .max(4000)
      .nullish()
      .describe("Prompt used to generate scheduled check-in content."),
  })
  .refine(
    (value) =>
      value.enabled != null ||
      value.cronExpression != null ||
      value.messagingChannelId != null ||
      value.prompt !== undefined,
    { message: "At least one scheduled check-ins field must be provided." },
  )
  .describe("Scheduled check-ins configuration payload.");

const draftKnowledgeUpsertSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe("Draft knowledge item title."),
    content: z
      .string()
      .trim()
      .min(1)
      .max(20_000)
      .describe("Draft knowledge item content."),
  })
  .describe("Draft knowledge base item to create or update.");

export const settingsPathSchema = z
  .enum([
    "assistant.multiRuleSelection.enabled",
    "assistant.meetingBriefs.enabled",
    "assistant.meetingBriefs.minutesBefore",
    "assistant.meetingBriefs.sendEmail",
    "assistant.attachmentFiling.enabled",
    "assistant.attachmentFiling.prompt",
    "assistant.scheduledCheckIns.config",
    "assistant.draftKnowledgeBase.upsert",
    "assistant.draftKnowledgeBase.delete",
  ])
  .describe("Writable assistant settings path.");

export const settingsChangeSchema = z.discriminatedUnion("path", [
  z.object({
    path: z
      .literal("assistant.multiRuleSelection.enabled")
      .describe("Update multi-rule selection support."),
    value: z.boolean().describe("Whether multi-rule selection is enabled."),
  }),
  z.object({
    path: z
      .literal("assistant.meetingBriefs.enabled")
      .describe("Update whether meeting briefs are enabled."),
    value: z.boolean().describe("Whether meeting briefs are enabled."),
  }),
  z.object({
    path: z
      .literal("assistant.meetingBriefs.minutesBefore")
      .describe("Update how many minutes before a meeting to generate briefs."),
    value: z
      .number()
      .int()
      .min(1)
      .max(2880)
      .describe("Minutes before the meeting to generate briefs."),
  }),
  z.object({
    path: z
      .literal("assistant.meetingBriefs.sendEmail")
      .describe("Update whether meeting briefs are emailed to the user."),
    value: z
      .boolean()
      .describe("Enable or disable emailing meeting briefs to the user."),
  }),
  z.object({
    path: z
      .literal("assistant.attachmentFiling.enabled")
      .describe("Update whether attachment filing is enabled."),
    value: z.boolean().describe("Whether attachment filing is enabled."),
  }),
  z.object({
    path: z
      .literal("assistant.attachmentFiling.prompt")
      .describe("Update the attachment filing prompt."),
    value: z
      .string()
      .max(6000)
      .nullable()
      .describe("Prompt used to file attachments."),
  }),
  z.object({
    path: z
      .literal("assistant.scheduledCheckIns.config")
      .describe("Update scheduled check-ins configuration."),
    value: scheduledCheckInsConfigSchema.describe(
      "Scheduled check-ins configuration payload.",
    ),
  }),
  z.object({
    path: z
      .literal("assistant.draftKnowledgeBase.upsert")
      .describe("Create or update a draft knowledge base item."),
    value: draftKnowledgeUpsertSchema.describe(
      "Draft knowledge base item to create or update.",
    ),
    mode: z
      .enum(["replace", "append"])
      .default("replace")
      .describe("Use append to add to existing content by title."),
  }),
  z.object({
    path: z
      .literal("assistant.draftKnowledgeBase.delete")
      .describe("Delete a draft knowledge base item."),
    value: z
      .object({
        title: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .describe("Title of the draft knowledge item to delete."),
      })
      .describe("Draft knowledge base delete payload."),
  }),
]);

const NULLABLE_SETTINGS_PATHS = new Set<string>([
  "assistant.attachmentFiling.prompt",
]);

export function isNullableSettingsPath(path: string): boolean {
  return NULLABLE_SETTINGS_PATHS.has(path);
}

export const updateAssistantSettingsInputSchema = z.object({
  changes: z
    .array(settingsChangeSchema)
    .min(1)
    .max(20)
    .describe("Structured settings changes to apply."),
});

export const updateAssistantSettingsCompatChangeSchema = z
  .object({
    path: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .describe(
        "Writable settings path (use a path returned by getAssistantCapabilities).",
      ),
    value: z
      .unknown()
      .describe(
        "Setting value for the path. Type depends on the path definition.",
      ),
    mode: z
      .enum(["append", "replace"])
      .nullish()
      .describe("Optional mode for appendable fields."),
  })
  .strict();

export const updateAssistantSettingsCompatInputSchema = z.object({
  changes: z
    .array(updateAssistantSettingsCompatChangeSchema)
    .min(1)
    .max(20)
    .describe("Structured settings changes to apply."),
});

export type AccountSettingsSnapshot = {
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
      intervalDays: number | null;
      occurrences: number | null;
      daysOfWeek: number | null;
      timeOfDay: string | null;
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

type ScheduledCheckInsConfig = {
  enabled: boolean;
  cronExpression: string | null;
  messagingChannelId: string | null;
  prompt: string | null;
};

type DraftKnowledgeItem =
  AccountSettingsSnapshot["draftKnowledgeBase"]["items"][number];

const accountSettingsSnapshotRawSelect = {
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
  messagingChannels: {
    where: {
      isConnected: true,
      provider: {
        in: SUPPORTED_AUTOMATION_MESSAGING_PROVIDERS,
      },
      routes: {
        some: {
          purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
        },
      },
      OR: [
        {
          provider: MessagingProvider.SLACK,
          accessToken: { not: null },
        },
        {
          provider: {
            in: [MessagingProvider.TEAMS, MessagingProvider.TELEGRAM],
          },
        },
      ],
    },
    select: {
      id: true,
      provider: true,
      teamName: true,
      isConnected: true,
      routes: {
        select: {
          purpose: true,
          targetType: true,
          targetId: true,
        },
      },
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
} satisfies Prisma.EmailAccountSelect;

type AccountSettingsSnapshotRaw = Prisma.EmailAccountGetPayload<{
  select: typeof accountSettingsSnapshotRawSelect;
}>;

const scheduledCheckInsAutomationJobSelect = {
  id: true,
  enabled: true,
  cronExpression: true,
  prompt: true,
  nextRunAt: true,
  messagingChannelId: true,
  messagingChannel: {
    select: {
      provider: true,
      teamName: true,
      routes: {
        select: {
          purpose: true,
          targetType: true,
          targetId: true,
        },
      },
    },
  },
} satisfies Prisma.AutomationJobSelect;

type ScheduledCheckInsAutomationJob = Prisma.AutomationJobGetPayload<{
  select: typeof scheduledCheckInsAutomationJobSelect;
}>;

type ScheduledCheckInsSnapshotSource = {
  automationJob: ScheduledCheckInsAutomationJob | null;
  messagingChannels: AccountSettingsSnapshotRaw["messagingChannels"];
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

export async function trackSettingsToolCall({
  tool,
  email,
  logger,
}: {
  tool: string;
  email: string;
  logger: Logger;
}) {
  logger.trace("Tracking tool call", { tool, email });
  return posthogCaptureEvent(email, "AI Assistant Chat Tool Call", { tool });
}

export async function executeUpdateAssistantSettings({
  emailAccountId,
  userId,
  logger,
  changes,
}: {
  emailAccountId: string;
  userId: string;
  logger: Logger;
  changes: Array<z.infer<typeof settingsChangeSchema>>;
}) {
  try {
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
    let scheduledCheckInsConfig: ScheduledCheckInsConfig | null = null;
    let hasScheduledCheckInsPremium: boolean | null = null;
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
    const draftKnowledgeByTitle = new Map<string, DraftKnowledgeItem>(
      existing.draftKnowledgeBase.items.map((item: DraftKnowledgeItem) => [
        item.title,
        item,
      ]),
    );

    for (const change of normalizedChanges) {
      if (change.path === "assistant.draftKnowledgeBase.upsert") {
        const existingItem = draftKnowledgeByTitle.get(change.value.title);
        const nextContent = mergeAppendableText({
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
        const message = error instanceof Error ? error.message : String(error);
        return { error: message };
      }

      if (areValuesEqual(previousValue, resolvedNextValue)) continue;

      if (
        change.path === "assistant.scheduledCheckIns.config" &&
        requiresScheduledCheckInsPremium({
          current: previousValue as ScheduledCheckInsConfig,
          next: resolvedNextValue as ScheduledCheckInsConfig,
        })
      ) {
        if (hasScheduledCheckInsPremium === null) {
          hasScheduledCheckInsPremium = await canEnableAutomationJobs(userId);
        }

        if (!hasScheduledCheckInsPremium) {
          return { error: "Premium is required for scheduled check-ins." };
        }
      }

      appliedChanges.push({
        path: change.path,
        previous: previousValue,
        next: resolvedNextValue,
      });

      switch (change.path) {
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
          scheduledCheckInsConfig =
            resolvedNextValue as ScheduledCheckInsConfig;
          break;
      }
    }

    if (appliedChanges.length === 0) {
      return {
        success: true,
        message: "No setting changes were needed.",
        appliedChanges: [],
      };
    }

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
      } else {
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
      appliedChanges,
    };
  } catch (error) {
    logger.error("Failed to update assistant settings", { error });
    return {
      error: "Failed to update assistant settings",
    };
  }
}

export function getUpdateAssistantSettingsValidationError(error: z.ZodError) {
  const issueSummary = error.issues
    .slice(0, 3)
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "input";
      return `${path}: ${issue.message}`;
    })
    .join("; ");

  return `Invalid settings update payload. ${issueSummary}. Use a writable path from getAssistantCapabilities.`;
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

export function getWritableCapabilities(snapshot: AccountSettingsSnapshot) {
  return [
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

export function getReadOnlyCapabilities(snapshot: AccountSettingsSnapshot) {
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

function mergeAppendableText({
  existingContent,
  incomingContent,
  mode,
}: {
  existingContent: string | null | undefined;
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

  const messagingChannelId =
    change.messagingChannelId ?? snapshot.messagingChannelId ?? null;

  if (enabled && !messagingChannelId) {
    throw new Error(
      "Provide a messagingChannelId when enabling scheduled check-ins. Ask the user to choose a destination from availableChannels.",
    );
  }

  if (
    enabled &&
    messagingChannelId &&
    !snapshot.availableChannels.some(
      (channel) => channel.id === messagingChannelId,
    )
  ) {
    throw new Error(
      "Selected messaging destination is unavailable. Refresh capabilities and choose another channel.",
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
  config: ScheduledCheckInsConfig;
}) {
  const cronExpression = config.cronExpression ?? DEFAULT_AUTOMATION_JOB_CRON;

  if (!current.jobId) {
    if (!config.enabled || !config.messagingChannelId) return;

    await createAutomationJob({
      emailAccountId,
      cronExpression,
      prompt: config.prompt,
      messagingChannelId: config.messagingChannelId,
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
  emailAccount: ScheduledCheckInsSnapshotSource,
) {
  const availableChannels = emailAccount.messagingChannels
    .filter((channel) =>
      hasMessagingRoute(
        channel.routes,
        MessagingRoutePurpose.RULE_NOTIFICATIONS,
      ),
    )
    .map((channel) => ({
      id: channel.id,
      label: formatMessagingChannelLabel({
        provider: channel.provider,
        teamName: channel.teamName,
        routeLabel: formatRouteTargetLabel(
          getMessagingRoute(
            channel.routes,
            MessagingRoutePurpose.RULE_NOTIFICATIONS,
          ),
        ),
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
      ? formatMessagingChannelLabel({
          provider: emailAccount.automationJob.messagingChannel.provider,
          teamName: emailAccount.automationJob.messagingChannel.teamName,
          routeLabel: formatRouteTargetLabel(
            getMessagingRoute(
              emailAccount.automationJob.messagingChannel.routes,
              MessagingRoutePurpose.RULE_NOTIFICATIONS,
            ),
          ),
        })
      : null,
    availableChannels,
  };
}

function formatMessagingChannelLabel({
  provider,
  teamName,
  routeLabel,
}: {
  provider: MessagingProvider;
  teamName: string | null;
  routeLabel: string | null;
}) {
  if (routeLabel && teamName) return `${routeLabel} (${teamName})`;
  if (routeLabel) return routeLabel;
  if (teamName) return teamName;

  if (provider === MessagingProvider.TEAMS) return "Teams destination";
  if (provider === MessagingProvider.TELEGRAM) return "Telegram destination";

  return "Slack workspace";
}

function requiresScheduledCheckInsPremium({
  current,
  next,
}: {
  current: ScheduledCheckInsConfig;
  next: ScheduledCheckInsConfig;
}) {
  return !isDisableOnlyScheduledCheckInsChange({ current, next });
}

function isDisableOnlyScheduledCheckInsChange({
  current,
  next,
}: {
  current: ScheduledCheckInsConfig;
  next: ScheduledCheckInsConfig;
}) {
  return (
    current.enabled &&
    !next.enabled &&
    current.cronExpression === next.cronExpression &&
    current.messagingChannelId === next.messagingChannelId &&
    current.prompt === next.prompt
  );
}

export async function loadAccountSettingsSnapshot(emailAccountId: string) {
  const [emailAccount, automationJob] = await Promise.all([
    loadAccountSettingsSnapshotRaw(emailAccountId),
    loadScheduledCheckInsAutomationJob(emailAccountId),
  ]);

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
            timeOfDay:
              emailAccount.digestSchedule.timeOfDay?.toISOString() ?? null,
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
    scheduledCheckIns: buildScheduledCheckInsSnapshot({
      automationJob,
      messagingChannels: emailAccount.messagingChannels,
    }),
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

async function loadAccountSettingsSnapshotRaw(
  emailAccountId: string,
): Promise<AccountSettingsSnapshotRaw | null> {
  return prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: accountSettingsSnapshotRawSelect,
  });
}

async function loadScheduledCheckInsAutomationJob(emailAccountId: string) {
  return prisma.automationJob.findUnique({
    where: { emailAccountId },
    select: scheduledCheckInsAutomationJobSelect,
  });
}
