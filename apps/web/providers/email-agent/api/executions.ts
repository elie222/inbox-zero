import prisma from "@/utils/prisma";
import type {
  AgentExecution,
  AgentExecutionListParams,
  AgentExecutionStatus,
  ToolCall,
} from "../types";

/**
 * Get agent executions for an email account
 */
export async function getAgentExecutions(
  emailAccountId: string,
  params: AgentExecutionListParams = {},
): Promise<AgentExecution[]> {
  const { limit = 50, offset = 0, status } = params;

  return prisma.agentExecution.findMany({
    where: {
      emailAccountId,
      ...(status && { status }),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });
}

/**
 * Get a single execution by ID
 */
export async function getAgentExecution(
  executionId: string,
  emailAccountId: string,
): Promise<AgentExecution | null> {
  const execution = await prisma.agentExecution.findUnique({
    where: { id: executionId },
  });

  // Verify ownership
  if (execution?.emailAccountId !== emailAccountId) {
    return null;
  }

  return execution;
}

/**
 * Record a new agent execution
 */
export async function recordAgentExecution({
  agentConfigId,
  emailAccountId,
  threadId,
  messageId,
  status,
  reasoning,
  toolCalls,
}: {
  agentConfigId: string;
  emailAccountId: string;
  threadId: string;
  messageId: string;
  status: AgentExecutionStatus;
  reasoning?: string;
  toolCalls: ToolCall[];
}): Promise<AgentExecution> {
  return prisma.agentExecution.create({
    data: {
      agentConfigId,
      emailAccountId,
      threadId,
      messageId,
      status,
      reasoning,
      toolCalls: toolCalls as unknown as object[],
    },
  });
}

/**
 * Update execution status (e.g., from PROCESSING to COMPLETED)
 */
export async function updateAgentExecutionStatus(
  executionId: string,
  status: AgentExecutionStatus,
  updates?: {
    reasoning?: string;
    toolCalls?: ToolCall[];
  },
): Promise<AgentExecution> {
  return prisma.agentExecution.update({
    where: { id: executionId },
    data: {
      status,
      ...(updates?.reasoning && { reasoning: updates.reasoning }),
      ...(updates?.toolCalls && {
        toolCalls: updates.toolCalls as unknown as object[],
      }),
    },
  });
}

/**
 * Check if an email has already been processed by the agent
 */
export async function hasAgentProcessedEmail(
  emailAccountId: string,
  messageId: string,
): Promise<boolean> {
  const existing = await prisma.agentExecution.findFirst({
    where: {
      emailAccountId,
      messageId,
      status: { in: ["COMPLETED", "SKIPPED"] },
    },
    select: { id: true },
  });

  return !!existing;
}

/**
 * Get execution stats for an email account
 */
export async function getAgentExecutionStats(
  emailAccountId: string,
  days = 7,
): Promise<{
  total: number;
  completed: number;
  skipped: number;
  errors: number;
}> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const stats = await prisma.agentExecution.groupBy({
    by: ["status"],
    where: {
      emailAccountId,
      createdAt: { gte: since },
    },
    _count: true,
  });

  const result = {
    total: 0,
    completed: 0,
    skipped: 0,
    errors: 0,
  };

  for (const stat of stats) {
    result.total += stat._count;
    if (stat.status === "COMPLETED") result.completed = stat._count;
    if (stat.status === "SKIPPED") result.skipped = stat._count;
    if (stat.status === "ERROR") result.errors = stat._count;
  }

  return result;
}
