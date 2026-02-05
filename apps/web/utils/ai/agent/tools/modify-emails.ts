import { tool, type InferUITool } from "ai";
import { z } from "zod";
import type {
  AgentToolContextWithEmail,
  ExecuteActionFn,
  StructuredAction,
} from "@/utils/ai/agent/types";

const labelActionSchema = z.object({
  type: z.literal("label"),
  targetExternalId: z.string().optional(),
  targetName: z.string().optional(),
});

const moveActionSchema = z.object({
  type: z.literal("moveFolder"),
  targetExternalId: z.string().optional(),
  targetName: z.string().optional(),
});

const actionSchema = z.union([
  z.object({ type: z.literal("archive") }),
  z.object({ type: z.literal("markRead"), read: z.boolean().optional() }),
  labelActionSchema,
  moveActionSchema,
]);

type ModifyActionType = z.infer<typeof actionSchema>["type"];

const modifyEmailsSchema = z.object({
  actions: z
    .array(actionSchema)
    .min(1)
    .superRefine((actions, ctx) => {
      actions.forEach((action, index) => {
        if (
          (action.type === "label" || action.type === "moveFolder") &&
          !action.targetExternalId &&
          !action.targetName
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Provide targetExternalId or targetName",
            path: [index],
          });
        }
      });
    })
    .describe("Actions to apply to the email"),
});

type ModifyEmailsToolContext = AgentToolContextWithEmail & {
  executeAction: ExecuteActionFn;
  dryRun?: boolean;
};

export const modifyEmailsTool = ({
  emailAccountId,
  provider,
  resourceType,
  emailId,
  threadId,
  logger,
  executeAction,
  dryRun,
}: ModifyEmailsToolContext) =>
  tool({
    description: "Apply actions like archive, label, move folder, markRead",
    inputSchema: modifyEmailsSchema,
    execute: async ({ actions }) => {
      const log = logger.with({ tool: "modifyEmails" });
      log.info("Applying email actions", { actionCount: actions.length });

      const results = [];

      for (const action of actions) {
        const structuredAction: StructuredAction = {
          type: getStructuredActionType(action.type),
          resourceId: emailId,
          ...(action.type === "markRead" ? { read: action.read } : {}),
          ...(action.type === "label"
            ? {
                targetExternalId: action.targetExternalId,
                targetName: action.targetName,
              }
            : {}),
          ...(action.type === "moveFolder"
            ? {
                targetExternalId: action.targetExternalId,
                targetName: action.targetName,
              }
            : {}),
        };

        const result = await executeAction(structuredAction, {
          emailAccountId,
          provider,
          resourceType,
          emailId,
          threadId,
          triggeredBy: "ai:decision",
          dryRun,
        });

        results.push({
          action: structuredAction,
          result,
        });
      }

      return {
        emailId,
        threadId,
        results,
      };
    },
  });

export type ModifyEmailsTool = InferUITool<ReturnType<typeof modifyEmailsTool>>;

function getStructuredActionType(
  type: ModifyActionType,
): StructuredAction["type"] {
  switch (type) {
    case "label":
      return "label";
    case "moveFolder":
      return "moveFolder";
    case "archive":
      return "archive";
    case "markRead":
      return "markRead";
    default: {
      const exhaustiveCheck: never = type;
      return exhaustiveCheck;
    }
  }
}
