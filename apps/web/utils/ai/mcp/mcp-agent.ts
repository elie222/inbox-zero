import { stepCountIs, type ToolSet } from "ai";
import { createGenerateText } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { createMcpToolsForAgent } from "@/utils/ai/mcp/mcp-tools";
import { getModel } from "@/utils/llms/model";

export type McpAgentOptions = {
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

export async function runMcpAgent(
  options: McpAgentOptions,
  mcpTools: ToolSet,
): Promise<McpAgentResponse> {
  const { emailAccount, context } = options;

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

  const prompt = `User query: TODO

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
  });

  return {
    response: result.text,
    toolCalls: result.toolCalls?.map((call) => ({
      toolName: call.toolName,
      arguments: call.input as Record<string, unknown>,
      result: `${JSON.stringify((call as Record<string, unknown>).result).slice(0, 200)}...`,
    })),
  };
}

/**
 * AI agent that uses MCP tools to search and fetch relevant context
 */
export async function mcpAgent(
  options: McpAgentOptions,
): Promise<McpAgentResponse | null> {
  const { emailAccount } = options;

  const mcpTools = await createMcpToolsForAgent(emailAccount.id);
  const hasTools = Object.keys(mcpTools).length > 0;

  if (!hasTools) return null;

  return await runMcpAgent(options, mcpTools as ToolSet);
}
