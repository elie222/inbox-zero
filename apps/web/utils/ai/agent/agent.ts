import { ToolLoopAgent, smoothStream, stepCountIs } from "ai";
import type { ModelMessage, ToolSet } from "ai";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import { saveAiUsage } from "@/utils/usage";
import {
  buildAgentSystemPrompt,
  fetchOnboardingData,
  getAgentSystemData,
  type AgentMode,
  type OnboardingData,
} from "@/utils/ai/agent/context";
import { createEmailProvider } from "@/utils/email/provider";
import { createExecuteAction } from "@/utils/ai/agent/execution";
import {
  bulkArchiveTool,
  createPatternTool,
  draftReplyTool,
  forwardEmailTool,
  getEmailTool,
  getSettingsTool,
  getSkillTool,
  modifyEmailsTool,
  removePatternTool,
  searchEmailsTool,
  sendEmailTool,
  showSetupPreviewTool,
  completeOnboardingTool,
  updateSettingsTool,
  updateAboutTool,
  searchConversationsTool,
} from "@/utils/ai/agent/tools";
import type { ParsedMessage } from "@/utils/types";
import { stringifyEmail } from "@/utils/stringify-email";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { getModel } from "@/utils/llms/model";

export type AgentRunContext = {
  mode: AgentMode;
  email?: ParsedMessage;
  dryRun?: boolean;
};

export async function aiProcessAgentChat({
  messages,
  emailAccount,
  logger,
  context,
}: {
  messages: ModelMessage[];
  emailAccount: EmailAccountWithAI & { name?: string | null };
  logger: Logger;
  context: AgentRunContext;
}) {
  const systemData = await getAgentSystemData({
    emailAccountId: emailAccount.id,
  });

  let onboardingData: OnboardingData | undefined;
  if (context.mode === "onboarding") {
    try {
      onboardingData = await fetchOnboardingData({
        emailProvider: await createEmailProvider({
          emailAccountId: emailAccount.id,
          provider: emailAccount.account.provider,
          logger,
        }),
        personaAnalysis: (emailAccount as Record<string, unknown>)
          .personaAnalysis,
      });
    } catch (error) {
      logger.error("Failed to fetch onboarding data", { error });
    }
  }

  const system = await buildAgentSystemPrompt({
    emailAccount,
    mode: context.mode,
    systemData,
    onboardingData,
  });

  const executeAction = createExecuteAction({
    logger,
    emailAccountEmail: emailAccount.email,
  });

  const tools = createAgentTools({
    emailAccount,
    logger,
    executeAction,
    dryRun: context.dryRun,
    mode: context.mode,
    emailId: context.email?.id,
    threadId: context.email?.threadId,
  });

  const contextMessages: ModelMessage[] = [];

  if (context.email) {
    const emailPrompt = stringifyEmail(
      getEmailForLLM(context.email, { maxLength: 4000 }),
      4000,
    );
    contextMessages.push({
      role: "system",
      content: `Context email:\n<email>\n${emailPrompt}\n</email>`,
    });
  }

  const { model, modelName, provider, providerOptions } = getModel(
    emailAccount.user,
    "chat",
  );

  const agent = new ToolLoopAgent({
    model,
    instructions: system,
    tools,
    stopWhen: stepCountIs(12),
    providerOptions,
    experimental_telemetry: { isEnabled: true },
    onStepFinish: async ({ text, toolCalls }) => {
      logger.trace("Agent step finished", { text, toolCalls });
    },
    onFinish: async ({ totalUsage }) => {
      await saveAiUsage({
        email: emailAccount.email,
        provider,
        model: modelName,
        usage: totalUsage,
        label: "agent-chat",
      });
    },
  });

  return agent.stream({
    messages: [...contextMessages, ...messages],
    experimental_transform: smoothStream({ chunking: "word" }),
  });
}

export function createAgentTools({
  emailAccount,
  logger,
  executeAction,
  dryRun,
  mode,
  emailId,
  threadId,
}: {
  emailAccount: EmailAccountWithAI;
  logger: Logger;
  executeAction: ReturnType<typeof createExecuteAction>;
  dryRun?: boolean;
  mode: AgentMode;
  emailId?: string;
  threadId?: string;
}): ToolSet {
  const baseContext = {
    emailAccountId: emailAccount.id,
    emailAccountEmail: emailAccount.email,
    provider: emailAccount.account.provider,
    resourceType: "email",
    logger,
    dryRun,
  };
  const emailContext = emailId ? { ...baseContext, emailId, threadId } : null;

  if (mode === "onboarding") {
    return {
      searchEmails: searchEmailsTool(baseContext),
      bulkArchive: bulkArchiveTool({ ...baseContext, skipValidation: true }),
      showSetupPreview: showSetupPreviewTool(),
      completeOnboarding: completeOnboardingTool({
        emailAccountId: emailAccount.id,
        userId: emailAccount.userId,
        provider: emailAccount.account.provider,
        logger,
      }),
    };
  }

  if (mode === "processing_email") {
    if (!emailContext) {
      throw new Error("processing_email mode requires email context");
    }
    return {
      modifyEmails: modifyEmailsTool({ ...emailContext, executeAction }),
      getEmail: getEmailTool(emailContext),
      draftReply: draftReplyTool({ ...emailContext, executeAction }),
      sendEmail: sendEmailTool({ ...baseContext, executeAction }),
      forwardEmail: forwardEmailTool({ ...emailContext, executeAction }),
      getSkill: getSkillTool(baseContext),
      createPattern: createPatternTool(baseContext),
      removePattern: removePatternTool(baseContext),
      searchConversations: searchConversationsTool(baseContext),
    };
  }

  return {
    searchEmails: searchEmailsTool(baseContext),
    sendEmail: sendEmailTool({ ...baseContext, executeAction }),
    getSkill: getSkillTool(baseContext),
    getSettings: getSettingsTool(baseContext),
    updateSettings: updateSettingsTool({ ...baseContext, executeAction }),
    showSetupPreview: showSetupPreviewTool(),
    createPattern: createPatternTool(baseContext),
    removePattern: removePatternTool(baseContext),
    updateAbout: updateAboutTool(baseContext),
    searchConversations: searchConversationsTool(baseContext),
  };
}
