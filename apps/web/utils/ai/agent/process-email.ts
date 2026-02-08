import { ToolLoopAgent, stepCountIs } from "ai";
import type { ParsedMessage } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import {
  buildAgentSystemPrompt,
  getAgentSystemData,
} from "@/utils/ai/agent/context";
import { createAgentTools } from "@/utils/ai/agent/agent";
import { createExecuteAction, executeAction } from "@/utils/ai/agent/execution";
import { getModel } from "@/utils/llms/model";
import { saveAiUsage } from "@/utils/usage";
import { stringifyEmail } from "@/utils/stringify-email";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { findMatchingPatterns } from "@/utils/ai/agent/match-patterns";
import type { StructuredAction } from "@/utils/ai/agent/types";

export async function runAgentOnIncomingEmail({
  emailAccount,
  message,
  logger,
}: {
  emailAccount: EmailAccountWithAI & { name?: string | null };
  message: ParsedMessage;
  logger: Logger;
}) {
  const provider = emailAccount.account.provider;

  const match = await findMatchingPatterns({
    emailAccountId: emailAccount.id,
    provider,
    resourceType: "email",
    headers: message.headers,
    logger,
  });

  if (match) {
    logger.info("Pattern matched, executing actions without LLM", {
      patternId: match.patternId,
    });

    for (const patternAction of match.actions) {
      const {
        type: _t,
        resourceId: _r,
        ...safeData
      } = typeof patternAction.actionData === "object" &&
      patternAction.actionData !== null
        ? (patternAction.actionData as Record<string, unknown>)
        : {};
      const action = {
        ...safeData,
        type: patternAction.actionType,
        resourceId: message.id,
      } as StructuredAction;

      try {
        await executeAction({
          action,
          context: {
            emailAccountId: emailAccount.id,
            provider,
            resourceType: "email",
            emailId: message.id,
            threadId: message.threadId,
            messageSubject: message.headers.subject,
            triggeredBy: "pattern",
            patternId: match.patternId,
          },
          logger,
          emailAccountEmail: emailAccount.email,
        });
      } catch (error) {
        logger.error("Pattern action failed, continuing", {
          patternId: match.patternId,
          actionType: patternAction.actionType,
          error,
        });
      }
    }

    return;
  }

  const systemData = await getAgentSystemData({
    emailAccountId: emailAccount.id,
  });

  const system = await buildAgentSystemPrompt({
    emailAccount,
    mode: "processing_email",
    systemData,
  });

  const {
    model,
    modelName,
    provider: aiProvider,
    providerOptions,
  } = getModel(emailAccount.user, "chat");

  const boundExecuteAction = createExecuteAction({
    logger,
    emailAccountEmail: emailAccount.email,
  });

  const tools = createAgentTools({
    emailAccount,
    logger,
    executeAction: boundExecuteAction,
    mode: "processing_email",
    emailId: message.id,
    threadId: message.threadId,
  });

  const emailPrompt = stringifyEmail(
    getEmailForLLM(message, { maxLength: 4000 }),
    4000,
  );

  const agent = new ToolLoopAgent({
    model,
    instructions: system,
    tools,
    stopWhen: stepCountIs(8),
    providerOptions,
    experimental_telemetry: { isEnabled: true },
    onFinish: async ({ totalUsage }) => {
      await saveAiUsage({
        email: emailAccount.email,
        provider: aiProvider,
        model: modelName,
        usage: totalUsage,
        label: "agent-webhook",
      });
    },
  });

  await agent.generate({
    prompt: `Context email:\n<email>\n${emailPrompt}\n</email>\n\nEmail metadata:\n- messageId: ${message.id}\n- threadId: ${message.threadId}\n\nDecide if any actions should be taken using the available tools. If no action is needed, respond with "No action needed."`,
  });
}
