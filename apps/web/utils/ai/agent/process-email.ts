import { ToolLoopAgent, stepCountIs } from "ai";
import type { ParsedMessage } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import { buildAgentSystemPrompt } from "@/utils/ai/agent/context";
import { createAgentTools } from "@/utils/ai/agent/agent";
import { createExecuteAction } from "@/utils/ai/agent/execution";
import { getAgentSystemData } from "@/utils/ai/agent/system-data";
import { getModel } from "@/utils/llms/model";
import { saveAiUsage } from "@/utils/usage";
import { stringifyEmail } from "@/utils/stringify-email";
import { getEmailForLLM } from "@/utils/get-email-from-message";

export async function runAgentOnIncomingEmail({
  emailAccount,
  message,
  logger,
}: {
  emailAccount: EmailAccountWithAI & { name?: string | null };
  message: ParsedMessage;
  logger: Logger;
}) {
  const systemData = await getAgentSystemData({
    emailAccountId: emailAccount.id,
  });

  const system = await buildAgentSystemPrompt({
    emailAccount,
    mode: "processing_email",
    systemData,
  });

  const { model, modelName, provider, providerOptions } = getModel(
    emailAccount.user,
    "chat",
  );

  const executeAction = createExecuteAction({
    logger,
    emailAccountEmail: emailAccount.email,
  });

  const tools = createAgentTools({
    emailAccount,
    logger,
    executeAction,
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
        provider,
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
