import { type InferUITool, tool } from "ai";
import type { Logger } from "@/utils/logger";
import {
  emptyInputSchema,
  getReadOnlyCapabilities,
  getWritableCapabilities,
  loadAccountSettingsSnapshot,
  settingsPathSchema,
  trackSettingsToolCall,
} from "./shared";

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
      "Get a capability snapshot showing which assistant/account settings can be read or updated from chat. Use this for capability discovery or when the target setting is unclear, not for direct on/off requests for known supported settings like multi-rule selection, attachment filing, meeting briefs, or meeting-brief email delivery.",
    inputSchema: emptyInputSchema,
    execute: async () => {
      trackSettingsToolCall({
        tool: "get_assistant_capabilities",
        email,
        logger,
      });
      try {
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
      } catch (error) {
        logger.error("Failed to load assistant capabilities", { error });
        return {
          error: "Failed to load assistant capabilities",
        };
      }
    },
  });

export type GetAssistantCapabilitiesTool = InferUITool<
  ReturnType<typeof getAssistantCapabilitiesTool>
>;
