import { stepCountIs, type ToolSet } from "ai";
import { createGenerateText } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { createMcpToolsForAgent } from "@/utils/ai/mcp/mcp-tools";
import { getModel } from "@/utils/llms/model";
import type { EmailForLLM } from "@/utils/types";
import { getEmailListPrompt, getUserInfoPrompt } from "@/utils/ai/helpers";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("mcp-agent");

type McpAgentOptions = {
  emailAccount: EmailAccountWithAI;
  messages: EmailForLLM[];
};

type McpAgentResponse = {
  response: string | null;
  getToolCalls: () => Array<{
    toolName: string;
    arguments: Record<string, unknown>;
    result: string;
  }>;
};

const NO_RELEVANT_INFO_FOUND = "NO_RELEVANT_INFO_FOUND";

async function runMcpAgent(
  options: McpAgentOptions,
  mcpTools: ToolSet,
): Promise<McpAgentResponse> {
  const { emailAccount, messages } = options;

  const system = `You are a research assistant. Use your tools to search for relevant information about the email sender and topic.

SEARCH FOR:
- Sender's name, email, company in CRM/customer databases  
- Technical documentation if it's a technical question
- Billing information if it's about payments/subscriptions
- Product information if about features/services

OUTPUT RULES:
- If you find useful information: Summarize the key findings concisely
- If you find no useful information: You may briefly explain what you searched for, then end with exactly "${NO_RELEVANT_INFO_FOUND}"
- Do not ask for more tools or capabilities
- Be concise and factual

Start searching immediately.`;

  const prompt = `${getUserInfoPrompt({ emailAccount })}

The last emails in the thread are:

<thread>
${getEmailListPrompt({ messages, messageMaxLength: 1000, maxMessages: 5 })}
</thread>`;

  const modelOptions = getModel(emailAccount.user, "economy");

  const generateText = createGenerateText({
    userEmail: emailAccount.email,
    label: "MCP Agent",
    modelOptions,
  });

  const result = await generateText({
    ...modelOptions,
    tools: mcpTools,
    system,
    prompt,
    stopWhen: stepCountIs(10),
    onStepFinish: async ({ text, toolCalls }) => {
      logger.trace("Step finished", { text, toolCalls });
    },
  });

  const hasNoRelevantInfo = result.text.includes(NO_RELEVANT_INFO_FOUND);

  if (hasNoRelevantInfo) {
    logger.trace("No relevant information found", {
      explanation: result.text.replace(NO_RELEVANT_INFO_FOUND, "").trim(),
    });
  }

  return {
    response: hasNoRelevantInfo ? null : result.text,
    getToolCalls: () => {
      // Extract tool calls and results from all steps
      const allToolCallsWithResults = result.steps.flatMap((step) =>
        step.toolCalls.map((call) => {
          const toolResult = step.toolResults?.find(
            (result) => result.toolCallId === call.toolCallId,
          );
          return {
            toolName: call.toolName,
            arguments: call.input as Record<string, unknown>,
            result: toolResult?.output
              ? `${JSON.stringify(toolResult.output).slice(0, 200)}...`
              : "No result",
          };
        }),
      );
      return allToolCallsWithResults;
    },
  };
}

export async function mcpAgent(
  options: McpAgentOptions,
): Promise<McpAgentResponse | null> {
  const { emailAccount, messages } = options;

  if (!messages || messages.length === 0) return null;

  const { tools, cleanup } = await createMcpToolsForAgent(emailAccount.id);
  const hasTools = Object.keys(tools).length > 0;

  if (!hasTools) return null;

  try {
    return await runMcpAgent(options, tools as ToolSet);
  } finally {
    await cleanup();
  }
}
