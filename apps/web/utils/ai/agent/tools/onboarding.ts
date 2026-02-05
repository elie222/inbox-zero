import { tool, type InferUITool } from "ai";
import { z } from "zod";
import prisma from "@/utils/prisma";
import { applySettingsUpdate } from "@/utils/ai/agent/settings";
import { ensureEmailAccountsWatched } from "@/utils/email/watch-manager";
import type { Logger } from "@/utils/logger";

const DEFAULT_LABELS = [
  { name: "To Reply", actions: ["label"] },
  { name: "Awaiting Reply", actions: ["label"] },
  { name: "Actioned", actions: ["label"] },
  { name: "FYI", actions: ["label"] },
  { name: "Newsletter", actions: ["label"] },
  { name: "Calendar", actions: ["label"] },
  { name: "Receipt", actions: ["label"] },
  { name: "Notification", actions: ["label"] },
  { name: "Marketing", actions: ["skipInbox", "label"] },
  { name: "Cold Email", actions: ["skipInbox", "label"] },
] as const;

const showSetupPreviewSchema = z.object({});

export const showSetupPreviewTool = () =>
  tool({
    description:
      "Show a visual preview of the default labels. Call this to display the setup table. Keep your text brief - just a short intro before calling this.",
    inputSchema: showSetupPreviewSchema,
    execute: async () => {
      return {
        labels: DEFAULT_LABELS.map((l) => ({
          name: l.name,
          actions: [...l.actions],
        })),
      };
    },
  });

export type ShowSetupPreviewTool = InferUITool<
  ReturnType<typeof showSetupPreviewTool>
>;

const completeOnboardingSchema = z.object({
  enableDrafting: z
    .boolean()
    .default(false)
    .describe("Whether the agent should draft replies"),
  enableSend: z
    .boolean()
    .default(false)
    .describe("Whether the agent can send emails (requires approval)"),
});

export const completeOnboardingTool = ({
  emailAccountId,
  userId,
  provider,
  logger,
}: {
  emailAccountId: string;
  userId: string;
  provider: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Complete onboarding by saving the agent configuration and activating it. Call this once the user has confirmed the setup.",
    inputSchema: completeOnboardingSchema,
    execute: async ({ enableDrafting, enableSend }) => {
      const log = logger.with({ tool: "completeOnboarding" });
      log.info("Completing onboarding", { enableDrafting, enableSend });

      const allowedActions = [
        { actionType: "archive", enabled: true },
        { actionType: "classify", enabled: true },
        { actionType: "markRead", enabled: true },
        { actionType: "draft", enabled: enableDrafting },
        { actionType: "send", enabled: enableSend },
      ];

      const allowedActionOptions = DEFAULT_LABELS.map((label) => ({
        actionType: "classify",
        provider,
        kind: "label",
        name: label.name,
        targetGroup: {
          name: "Category",
          cardinality: "SINGLE" as const,
        },
      }));

      await applySettingsUpdate({
        emailAccountId,
        payload: { allowedActions, allowedActionOptions },
      });

      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: { agentModeEnabled: true },
      });

      // Fire-and-forget: set up Gmail/Outlook watch for incoming emails
      ensureEmailAccountsWatched({ userIds: [userId], logger }).catch(
        (error) => {
          log.error("Failed to set up email watch", { error });
        },
      );

      log.info("Onboarding complete", { emailAccountId });

      return { completed: true };
    },
  });

export type CompleteOnboardingTool = InferUITool<
  ReturnType<typeof completeOnboardingTool>
>;
