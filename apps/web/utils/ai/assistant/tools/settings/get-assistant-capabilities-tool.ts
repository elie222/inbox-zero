import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import {
  getReadOnlyCapabilities,
  getWritableCapabilities,
  loadAccountSettingsSnapshot,
  trackSettingsToolCall,
} from "./shared";

const emptyInputSchema = z.object({});

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
      "Get the authoritative capability and configuration snapshot for the connected email account. Use assistant.digest to answer digest recipient, combined-rule, schedule, estimated-delivery, queue, and last-delivery questions; digest email uses the connected account address and has no separate recipient setting. If no writable path supports the user's request, explain that limitation instead of approximating it through a different setting.",
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
          snapshotVersion: "2026-07-30",
          account: {
            email: snapshot.email,
            provider,
            timezone: snapshot.timezone,
          },
          capabilities: [
            ...getWritableCapabilities(snapshot),
            ...getReadOnlyCapabilities(snapshot),
          ],
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
