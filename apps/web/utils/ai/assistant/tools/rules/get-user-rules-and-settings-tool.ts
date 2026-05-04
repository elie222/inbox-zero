import { type InferUITool, tool } from "ai";
import type { z } from "zod";
import type { Logger } from "@/utils/logger";
import type { ActionType, LogicalOperator } from "@/generated/prisma/enums";
import {
  buildRuleReadState,
  getVisibleRulesFromSnapshot,
  loadAssistantRuleSnapshot,
  type RuleReadState,
} from "../../chat-rule-state";
import { emptyInputSchema, trackRuleToolCall } from "./shared";

type GetUserRulesAndSettingsOutput =
  | {
      personalInstructions: string;
      ruleNotificationDestinations: Array<{ provider: string }>;
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
                webhookUrl: string | null;
                folderName: string | null;
              }>;
              delayInMinutes?: number | null;
            }>;
            enabled: boolean;
            runOnThreads: boolean;
          }>
        | undefined;
    }
  | {
      error: string;
    };

export const getUserRulesAndSettingsTool = ({
  email,
  emailAccountId,
  logger,
  setRuleReadState,
  onRulesStateExposed,
}: {
  email: string;
  emailAccountId: string;
  logger: Logger;
  setRuleReadState?: (state: RuleReadState) => void;
  onRulesStateExposed?: (rulesRevision: number) => void;
}) =>
  tool<z.infer<typeof emptyInputSchema>, GetUserRulesAndSettingsOutput>({
    description:
      "Retrieve the latest rules and personal instructions for the user.",
    inputSchema: emptyInputSchema,
    execute: async () => {
      trackRuleToolCall({
        tool: "get_user_rules_and_settings",
        email,
        logger,
      });
      try {
        const snapshot = await loadAssistantRuleSnapshot({ emailAccountId });

        setRuleReadState?.(buildRuleReadState(snapshot));
        onRulesStateExposed?.(snapshot.rulesRevision);

        return {
          personalInstructions: snapshot.about,
          ruleNotificationDestinations: snapshot.ruleNotificationDestinations,
          rules: getVisibleRulesFromSnapshot(snapshot),
        };
      } catch (error) {
        logger.error("Failed to load rules and settings", { error });
        return {
          error: "Failed to load rules and settings",
        };
      }
    },
  });

export type GetUserRulesAndSettingsTool = InferUITool<
  ReturnType<typeof getUserRulesAndSettingsTool>
>;
