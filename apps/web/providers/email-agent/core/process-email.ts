import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import prisma from "@/utils/prisma";
import type {
  ProcessEmailWithAgentOptions,
  AgentExecutionResult,
  ToolCall,
} from "../types";
import { buildAgentSystemPrompt, buildEmailUserMessage } from "./build-prompt";
import { getEmailTools, type ToolContext } from "../tools/email-tools";
import { getMemoryTools, type MemoryToolContext } from "../tools/memory-tools";
import {
  getContextTools,
  type ContextToolContext,
} from "../tools/context-tools";
import { recordAgentExecution } from "../api/executions";

const MAX_STEPS = 10;

/**
 * Process an email with the Claude Agent
 */
export async function processEmailWithAgent(
  options: ProcessEmailWithAgentOptions,
): Promise<AgentExecutionResult> {
  const { provider, message, emailAccount, agentConfig, logger } = options;

  logger.info("Processing email with agent", {
    messageId: message.id,
    from: message.headers.from,
  });

  const toolCalls: ToolCall[] = [];

  const recordToolCall = (call: Omit<ToolCall, "timestamp">) => {
    toolCalls.push({ ...call, timestamp: new Date() });
  };

  try {
    // Get memories for context
    const memories = await prisma.agentMemory.findMany({
      where: { agentConfigId: agentConfig.id },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    // Build system prompt
    const systemPrompt = buildAgentSystemPrompt(agentConfig, memories);

    // Build user message with email content
    const userMessage = buildEmailUserMessage({
      from: message.headers.from,
      to: message.headers.to || "",
      subject: message.headers.subject || "",
      content: message.textPlain || message.textHtml || "",
      date: new Date(message.headers.date || Date.now()),
      threadId: message.threadId,
    });

    // Create tool contexts
    const emailToolCtx: ToolContext = {
      provider,
      message,
      emailAccountId: emailAccount.id,
      permissions: {
        canLabel: agentConfig.canLabel,
        canArchive: agentConfig.canArchive,
        canDraftReply: agentConfig.canDraftReply,
        canMarkRead: agentConfig.canMarkRead,
        canWebSearch: agentConfig.canWebSearch,
        canCreateLabel: agentConfig.canCreateLabel,
        forwardAllowList: agentConfig.forwardAllowList,
      },
      logger,
      recordToolCall,
    };

    const memoryToolCtx: MemoryToolContext = {
      agentConfigId: agentConfig.id,
      logger,
      recordToolCall,
    };

    const contextToolCtx: ContextToolContext = {
      provider,
      emailAccountId: emailAccount.id,
      logger,
      recordToolCall,
    };

    // Combine all tools
    const tools = {
      ...getEmailTools(emailToolCtx),
      ...getMemoryTools(memoryToolCtx),
      ...getContextTools(contextToolCtx),
    };

    // Create Anthropic client
    // Note: In production, this should use the user's API key or the app's key
    const anthropic = createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Run the agent
    logger.info("Running agent with tools", {
      toolCount: Object.keys(tools).length,
    });

    const result = await generateText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: systemPrompt,
      prompt: userMessage,
      tools,
      maxSteps: MAX_STEPS,
      onStepFinish: ({ text, toolCalls: stepToolCalls }) => {
        logger.trace("Agent step finished", {
          hasText: !!text,
          toolCallCount: stepToolCalls?.length || 0,
        });
      },
    });

    logger.info("Agent completed", {
      finishReason: result.finishReason,
      stepCount: result.steps.length,
      toolCallCount: toolCalls.length,
    });

    // Record execution
    await recordAgentExecution({
      agentConfigId: agentConfig.id,
      emailAccountId: emailAccount.id,
      threadId: message.threadId,
      messageId: message.id,
      status: "COMPLETED",
      reasoning: result.text,
      toolCalls,
    });

    return {
      status: "COMPLETED",
      reasoning: result.text,
      toolCalls,
    };
  } catch (error) {
    logger.error("Agent processing failed", { error });

    const errorMsg =
      error instanceof Error ? error.message : "Unknown error occurred";

    // Record failed execution
    await recordAgentExecution({
      agentConfigId: agentConfig.id,
      emailAccountId: emailAccount.id,
      threadId: message.threadId,
      messageId: message.id,
      status: "ERROR",
      reasoning: `Error: ${errorMsg}`,
      toolCalls,
    });

    return {
      status: "ERROR",
      error: errorMsg,
      toolCalls,
    };
  }
}
