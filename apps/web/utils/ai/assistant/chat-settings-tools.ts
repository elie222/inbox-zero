import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { posthogCaptureEvent } from "@/utils/posthog";
import { ActionType } from "@/generated/prisma/enums";

const emptyInputSchema = z.object({}).describe("No parameters required");

const settingsPathSchema = z.enum([
  "assistant.personalInstructions.about",
  "assistant.multiRuleSelection.enabled",
  "assistant.meetingBriefs.enabled",
  "assistant.meetingBriefs.minutesBefore",
  "assistant.meetingBriefs.sendEmail",
  "assistant.attachmentFiling.enabled",
  "assistant.attachmentFiling.prompt",
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
      const appliedChanges: Array<{
        path: z.infer<typeof settingsPathSchema>;
        previous: unknown;
        next: unknown;
      }> = [];

      for (const change of normalizedChanges) {
        const previousValue = getCurrentValue({
          snapshot: existing,
          path: change.path,
        });
        const resolvedNextValue = resolveNextValue({
          snapshot: existing,
          change,
        });

        if (Object.is(previousValue, resolvedNextValue)) continue;

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
        await prisma.emailAccount.update({
          where: { id: emailAccountId },
          data,
        });
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
  const deduped = new Map<
    z.infer<typeof settingsPathSchema>,
    z.infer<typeof settingsChangeSchema>
  >();

  for (const change of changes) {
    deduped.set(change.path, change);
  }

  return Array.from(deduped.values());
}

function resolveNextValue({
  snapshot,
  change,
}: {
  snapshot: AccountSettingsSnapshot;
  change: z.infer<typeof settingsChangeSchema>;
}) {
  if (change.path !== "assistant.personalInstructions.about") {
    return change.value;
  }

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

async function loadAccountSettingsSnapshot(emailAccountId: string) {
  const emailAccount = await prisma.emailAccount.findUnique({
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
    },
  });

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
  } satisfies AccountSettingsSnapshot;
}
