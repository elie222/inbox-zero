import { stepCountIs, type ToolSet } from "ai";
import { createGenerateText } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { createMcpToolsForAgent } from "@/utils/ai/mcp/mcp-tools";
import { getModel } from "@/utils/llms/model";
import type { EmailForLLM } from "@/utils/types";
import { stringifyEmail } from "@/utils/stringify-email";

type McpAgentOptions = {
  emailAccount: EmailAccountWithAI;
  messages: EmailForLLM[];
};

type McpAgentResponse = {
  response: string;
  toolCalls?: Array<{
    toolName: string;
    arguments: Record<string, unknown>;
    result: string;
  }>;
};

async function runMcpAgent(
  options: McpAgentOptions,
  mcpTools: ToolSet,
): Promise<McpAgentResponse> {
  const { emailAccount, messages } = options;

  const threadSummary = messages
    .map((email) => `<email>${stringifyEmail(email, 1000)}</email>`)
    .join("\n");

  const system = `You are an intelligent research assistant with access to the user's connected systems through MCP (Model Context Protocol) tools.

Your role is to gather relevant context about the email sender and situation to help draft a personalized reply.
You do not draft the reply yourself, just gather the context to help a downstream drafting agent.

Your research strategy:
1. **Customer/Contact Research**: Look up information about the sender in CRMs, customer databases
   - Search for sender name, email, company
   - Find account status, previous interactions, purchase history
   - Look for support tickets, refund history, subscription status

2. **Context-Specific Research**: Based on the email content, search for relevant information
   - If it's a support question, search documentation/knowledge base
   - If it's about billing/payments, check payment systems (Stripe, etc.)
   - If it's about orders/products, check order management systems
   - If it's about account issues, check user account status

3. **Company Information**: If sender represents a company, research the company
   - Company details, relationships, contracts
   - Previous business interactions

Search methodology:
- Start with the sender's name and email address
- Use company name if mentioned in the email
- Search for specific topics mentioned in the email (products, services, issues)
- Try different variations of names and terms
- Be thorough but efficient - gather enough context to inform a helpful reply

Guidelines:
- Focus on information that would help craft a personalized, informed reply
- Look for previous interaction history, preferences, account status
- Don't waste time on irrelevant details
- If no relevant information is found, that's okay - just report what you searched for
- Organize findings clearly with specific details about the person/company

Your task:
1. Analyze the current email thread to understand who the sender is and what they're asking about
2. Research the sender and any mentioned companies in connected systems
3. Look up relevant context based on the email content and subject
4. Find information that would help craft a personalized, informed reply

Be thorough but focused on information that helps with replying to this specific email.`;

  const prompt = `You need to research context about the sender and situation from this email thread to help draft a personalized reply.

<current_thread>
${threadSummary}
</current_thread>

${emailAccount.about ? `<user_context>${emailAccount.about}</user_context>` : ""}`;

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
  const { emailAccount, messages } = options;

  if (!messages || messages.length === 0) return null;

  const mcpTools = await createMcpToolsForAgent(emailAccount.id);
  const hasTools = Object.keys(mcpTools).length > 0;

  if (!hasTools) return null;

  return await runMcpAgent(options, mcpTools as ToolSet);
}
