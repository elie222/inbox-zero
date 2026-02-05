import { tool, type InferUITool } from "ai";
import { z } from "zod";
import prisma from "@/utils/prisma";
import { TargetGroupCardinality } from "@/generated/prisma/enums";
import type {
  AgentToolContext,
  ExecuteActionFn,
  StructuredAction,
} from "@/utils/ai/agent/types";
import { applySettingsUpdate } from "@/utils/ai/agent/settings";

const allowedActionSchema = z.object({
  actionType: z.string().min(1),
  resourceType: z.string().nullish(),
  enabled: z.boolean().optional(),
  config: z.unknown().optional(),
  conditions: z.unknown().optional(),
});

const targetGroupSchema = z.object({
  name: z.string().min(1),
  cardinality: z.enum([
    TargetGroupCardinality.SINGLE,
    TargetGroupCardinality.MULTI,
  ]),
  appliesToResourceType: z.string().nullish(),
});

const allowedActionOptionSchema = z.object({
  actionType: z.string().min(1),
  resourceType: z.string().nullish(),
  provider: z.string().min(1),
  kind: z.string().min(1),
  externalId: z.string().nullish(),
  name: z.string().min(1),
  targetGroup: targetGroupSchema.optional(),
  delete: z.boolean().optional(),
});

const getSettingsSchema = z.object({}).describe("No parameters required");

export const getSettingsTool = ({ emailAccountId, logger }: AgentToolContext) =>
  tool({
    description: "Get current agent settings and allow list",
    inputSchema: getSettingsSchema,
    execute: async () => {
      const log = logger.with({ tool: "getSettings" });
      log.info("Fetching agent settings");

      const [allowedActions, actionOptions, targetGroups] = await Promise.all([
        prisma.allowedAction.findMany({
          where: { emailAccountId },
          orderBy: { createdAt: "asc" },
        }),
        prisma.allowedActionOption.findMany({
          where: { emailAccountId },
          include: { targetGroup: true },
          orderBy: { createdAt: "asc" },
        }),
        prisma.targetGroup.findMany({
          where: { emailAccountId },
          orderBy: { createdAt: "asc" },
        }),
      ]);

      return {
        allowedActions,
        allowedActionOptions: actionOptions,
        targetGroups,
      };
    },
  });

export type GetSettingsTool = InferUITool<ReturnType<typeof getSettingsTool>>;

const updateAllowedActionsSchema = z.object({
  allowedActions: z
    .array(allowedActionSchema)
    .min(1)
    .describe("Allowed actions to upsert"),
});

export const updateAllowedActionsTool = ({
  emailAccountId,
  logger,
}: AgentToolContext) =>
  tool({
    description: "Update allowed actions (allow list)",
    inputSchema: updateAllowedActionsSchema,
    execute: async ({ allowedActions }) => {
      const log = logger.with({ tool: "updateAllowedActions" });
      log.info("Updating allowed actions", { count: allowedActions.length });

      try {
        await applySettingsUpdate({
          emailAccountId,
          payload: { allowedActions },
        });
      } catch (error) {
        log.error("Failed to update allowed actions", { error });
        return { error: "Invalid settings payload" };
      }

      return { success: true, updated: allowedActions.length };
    },
  });

export type UpdateAllowedActionsTool = InferUITool<
  ReturnType<typeof updateAllowedActionsTool>
>;

const updateSettingsSchema = z.object({
  allowedActions: z.array(allowedActionSchema).optional(),
  allowedActionOptions: z.array(allowedActionOptionSchema).optional(),
});

type UpdateSettingsToolContext = AgentToolContext & {
  executeAction: ExecuteActionFn;
  dryRun?: boolean;
};

export const updateSettingsTool = ({
  emailAccountId,
  provider,
  logger,
  executeAction,
  dryRun,
}: UpdateSettingsToolContext) =>
  tool({
    description: "Update agent settings and allow list targets",
    inputSchema: updateSettingsSchema,
    execute: async ({ allowedActions, allowedActionOptions }) => {
      const log = logger.with({ tool: "updateSettings" });
      log.info("Updating settings", {
        allowedActions: allowedActions?.length ?? 0,
        allowedActionOptions: allowedActionOptions?.length ?? 0,
      });

      const action: StructuredAction = {
        type: "updateSettings",
        settings: {
          allowedActions,
          allowedActionOptions,
        },
      };

      const result = await executeAction(action, {
        emailAccountId,
        provider,
        resourceType: "settings",
        triggeredBy: "ai:decision",
        dryRun,
      });

      return { result };
    },
  });

export type UpdateSettingsTool = InferUITool<
  ReturnType<typeof updateSettingsTool>
>;
