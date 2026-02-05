import { NextResponse } from "next/server";
import { z } from "zod";
import { ToolLoopAgent, stepCountIs } from "ai";
import { withEmailAccount } from "@/utils/middleware";
import { getEmailAccountWithAiInsights } from "@/utils/user/get";
import { createEmailProvider } from "@/utils/email/provider";
import { buildAgentSystemPrompt } from "@/utils/ai/agent/context";
import { createAgentTools } from "@/utils/ai/agent/agent";
import { createExecuteAction } from "@/utils/ai/agent/execution";
import { getAgentSystemData } from "@/utils/ai/agent/system-data";
import { getModel } from "@/utils/llms/model";
import { saveAiUsage } from "@/utils/usage";
import { stringifyEmail } from "@/utils/stringify-email";
import { getEmailForLLM } from "@/utils/get-email-from-message";

export const maxDuration = 120;

const testSchema = z.object({
  emailId: z.string().min(1),
});

export const POST = withEmailAccount("agent-test", async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const user = await getEmailAccountWithAiInsights({ emailAccountId });

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const json = await request.json();
  const { data, error } = testSchema.safeParse(json);

  if (error) {
    return NextResponse.json({ error: error.errors }, { status: 400 });
  }

  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider: user.account.provider,
    logger: request.logger,
  });

  const message = await emailProvider.getMessage(data.emailId);

  const systemData = await getAgentSystemData({
    emailAccountId: user.id,
  });

  const system = await buildAgentSystemPrompt({
    emailAccount: user,
    mode: "test",
    systemData,
  });

  const { model, modelName, provider, providerOptions } = getModel(
    user.user,
    "chat",
  );

  const executeAction = createExecuteAction({
    logger: request.logger,
    emailAccountEmail: user.email,
  });

  const tools = createAgentTools({
    emailAccount: user,
    logger: request.logger,
    executeAction,
    dryRun: true,
    mode: "test",
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
        email: user.email,
        provider,
        model: modelName,
        usage: totalUsage,
        label: "agent-test",
      });
    },
  });

  const result = await agent.generate({
    prompt: `Context email:\n<email>\n${emailPrompt}\n</email>\n\nRun a dry-run on the provided context email. Propose actions using tools when appropriate.`,
  });

  const toolCalls = result.steps.flatMap((step) =>
    step.toolCalls.map((call) => {
      const toolResult = step.toolResults?.find(
        (output) => output.toolCallId === call.toolCallId,
      );
      return {
        toolName: call.toolName,
        input: call.input,
        output: toolResult?.output ?? null,
      };
    }),
  );

  const skillsUsed = toolCalls
    .filter((call) => call.toolName === "getSkill")
    .map((call) => (call.input as { name?: string }).name)
    .filter(Boolean);

  const proposedActions = toolCalls.filter((call) =>
    ["modifyEmails", "draftReply", "sendEmail", "updateSettings"].includes(
      call.toolName,
    ),
  );

  return NextResponse.json({
    email: {
      id: message.id,
      subject: message.subject,
      from: message.headers.from,
    },
    skillsUsed,
    proposedActions,
    toolCalls,
  });
});
