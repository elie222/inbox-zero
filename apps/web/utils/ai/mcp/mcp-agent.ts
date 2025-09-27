import { createScopedLogger } from "@/utils/logger";
import { createGenerateText } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import {
  createMcpToolsForAgent,
  cleanupMcpClients,
} from "@/utils/ai/mcp/mcp-tools";
import { getModel } from "@/utils/llms/model";
import { stepCountIs } from "ai";

export type McpAgentOptions = {
  query: string;
  emailAccount: EmailAccountWithAI;
  context?: {
    emailContent?: string;
    senderName?: string;
    senderEmail?: string;
    subject?: string;
  };
};

export type McpAgentResponse = {
  response: string;
  toolCalls?: Array<{
    toolName: string;
    arguments: Record<string, unknown>;
    result: string;
  }>;
};

/**
 * AI agent that uses MCP tools to search and fetch relevant context
 */
export async function mcpAgent(
  options: McpAgentOptions,
): Promise<McpAgentResponse> {
  const { query, emailAccount, context } = options;
  const logger = createScopedLogger("mcp-agent").with({
    emailAccountId: emailAccount.id,
    query: query.slice(0, 100) + (query.length > 100 ? "..." : ""),
  });

  if (!query.trim()) {
    logger.warn("Empty query provided to MCP agent");
    return {
      response: "Please provide a question or query for me to help with.",
    };
  }

  logger.info("Starting MCP agent query");

  let mcpTools = {};

  try {
    // Get MCP tools for this email account
    mcpTools = await createMcpToolsForAgent(emailAccount.id);

    if (Object.keys(mcpTools).length === 0) {
      logger.info("No MCP tools available, providing basic response");
      return {
        response:
          "I don't have access to any external tools right now. Please connect your integrations (like Notion) to help me provide better assistance.",
      };
    }

    const toolNames = Object.keys(mcpTools).filter(
      (key) => !key.startsWith("_client_"),
    );

    logger.info("MCP tools loaded for agent", {
      toolsCount: toolNames.length,
      availableTools: toolNames,
      toolsDetails: toolNames.map((name) => ({
        name,
        description: (
          (mcpTools as Record<string, any>)[name]?.description ||
          "No description"
        )
          ?.toString()
          .slice(0, 100),
      })),
    });

    const system = `You are an autonomous AI research assistant with access to the user's connected workspaces through MCP (Model Context Protocol) tools.

Your role:
- Conduct thorough research by searching and fetching detailed information from connected sources
- Use multiple search strategies and follow up on interesting findings
- Fetch full content from relevant pages/documents to provide comprehensive answers
- Be proactive in gathering all relevant information before providing a final response

Available tools and research strategy:
- notion-search: Use to search across the user's Notion workspace and connected sources (Slack, Google Drive, etc.)
  * Try multiple search approaches: search for people ("query_type": "user"), then search for documents ("query_type": "internal")
  * Use different keywords and phrases to find comprehensive results
  * Follow up on interesting results by fetching detailed content
- notion-fetch: Use to get full content of specific pages/databases when you find relevant URLs or IDs from search results

Research methodology:
1. Start with broad searches using different keywords and query types
2. Identify the most relevant results from initial searches
3. Fetch detailed content from promising pages/documents using notion-fetch
4. Synthesize findings from multiple sources to provide comprehensive answers
5. Continue researching if initial results seem incomplete or if new leads emerge

Guidelines:
- Be thorough and autonomous - don't ask for permission to search more
- Always try multiple search approaches (user search + document search)
- Fetch full content from relevant pages to get complete information
- Provide detailed, well-researched responses with specific names, roles, and context
- If you find partial information, continue searching for more details
- Organize findings clearly with bullet points and specific details`;

    const prompt = `User query: ${query}

${
  context?.emailContent
    ? `<email_context>
Subject: ${context.subject || "No subject"}
From: ${context.senderName || "Unknown"} <${context.senderEmail || "unknown@email.com"}>
Content: ${context.emailContent.slice(0, 1000)}${context.emailContent.length > 1000 ? "..." : ""}
</email_context>`
    : ""
}

${emailAccount.about ? `<user_info>${emailAccount.about}</user_info>` : ""}

Please help answer this query using the available tools to search for relevant information.`;

    const modelOptions = getModel(emailAccount.user, "chat");

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
      stopWhen: stepCountIs(15),
    });

    // Log detailed steps and tool calls
    if (result.steps) {
      result.steps.forEach((step, index) => {
        logger.info(`Step ${index + 1}`, {
          stepType: (step as Record<string, unknown>).stepType || "unknown",
          text: step.text?.slice(0, 200),
          toolCalls: step.toolCalls?.map((call) => ({
            toolName: call.toolName,
            arguments: call.input,
          })),
        });
      });
    }

    if (result.toolCalls && result.toolCalls.length > 0) {
      logger.info("Tool calls made", {
        toolCalls: result.toolCalls.map((call) => ({
          toolName: call.toolName,
          arguments: call.input,
        })),
      });
    } else {
      logger.info("No tool calls made - AI responded without using tools");
    }

    logger.info("MCP agent completed", {
      stepsCount: result.steps?.length || 0,
      toolCallsCount: result.toolCalls?.length || 0,
      responseLength: result.text.length,
      finalResponse: result.text.slice(0, 200),
    });

    return {
      response: result.text,
      toolCalls: result.toolCalls?.map((call) => ({
        toolName: call.toolName,
        arguments: call.input as Record<string, unknown>,
        result: `${JSON.stringify((call as Record<string, unknown>).result).slice(0, 200)}...`,
      })),
    };
  } catch (error) {
    logger.error("MCP agent failed", { error });
    return {
      response:
        "I encountered an error while trying to help you. Please try again or contact support if the issue persists.",
    };
  } finally {
    // Clean up MCP client connections
    try {
      await cleanupMcpClients(mcpTools, logger);
    } catch (cleanupError) {
      logger.warn("Error cleaning up MCP clients", {
        cleanupError,
      });
    }
  }
}
