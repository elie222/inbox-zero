import { type InferUITool, tool } from "ai";
import type { Logger } from "@/utils/logger";
import {
  mailScreenActionInputSchema,
  parseMailScreenAction,
} from "@/utils/ai/assistant/mail-screen-action";
import { posthogCaptureEvent } from "@/utils/posthog";

export const controlMailScreenTool = ({
  email,
  logger,
}: {
  email: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Change what the user sees on the mail screen they are chatting from: select threads in the list, open a thread, or show a search. Use it when the user asks to see, open, select, or pick out emails on screen, so they can review and act with the app's own controls. It never changes the mailbox. Only threads in the list on screen can be selected; if they are not in the current view, show a search that includes them first, then select them.",
    inputSchema: mailScreenActionInputSchema,
    execute: async (input) => {
      const action = parseMailScreenAction(input);
      if ("error" in action) return action;

      logger.trace("Tracking tool call", {
        tool: "control_mail_screen",
        email,
      });
      posthogCaptureEvent(email, "AI Assistant Chat Tool Call", {
        tool: "control_mail_screen",
        action: action.action,
      });

      // The browser applies this on its own, so success means sent, not seen.
      return {
        success: true,
        sentToScreen: action.action,
        note: "Takes effect only on the user's open mail screen; threads not in the list on screen are not selected.",
      };
    },
  });

export type ControlMailScreenTool = InferUITool<
  ReturnType<typeof controlMailScreenTool>
>;
