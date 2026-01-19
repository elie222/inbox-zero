import type {
  AgentConfig,
  AgentDocument,
  AgentExecution,
  AgentMemory,
  AgentDocumentType,
  AgentExecutionStatus,
  AgentMemoryType,
  EmailAccount,
} from "@/generated/prisma";
import type { ParsedMessage } from "@/utils/types";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";

// Re-export Prisma types for convenience
export type {
  AgentConfig,
  AgentDocument,
  AgentExecution,
  AgentMemory,
  AgentDocumentType,
  AgentExecutionStatus,
  AgentMemoryType,
};

// Agent config with relations
export type AgentConfigWithDocuments = AgentConfig & {
  documents: AgentDocument[];
};

export type AgentConfigWithAll = AgentConfig & {
  documents: AgentDocument[];
  memories: AgentMemory[];
};

// Tool call record
export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
  timestamp: Date;
}

// Agent execution result
export interface AgentExecutionResult {
  status: AgentExecutionStatus;
  reasoning?: string;
  toolCalls: ToolCall[];
  error?: string;
}

// Context passed to agent
export interface AgentContext {
  emailAccount: EmailAccount;
  agentConfig: AgentConfigWithDocuments;
  memories: AgentMemory[];
  labels: { id: string; name: string }[];
  senderHistory?: {
    previousEmails: number;
    lastEmailDate?: Date;
  };
}

// Options for processing email with agent
export interface ProcessEmailWithAgentOptions {
  provider: EmailProvider;
  message: ParsedMessage;
  emailAccount: EmailAccount;
  agentConfig: AgentConfigWithDocuments;
  logger: Logger;
}

// Tool permission check
export type ToolPermissions = Pick<
  AgentConfig,
  | "canLabel"
  | "canArchive"
  | "canDraftReply"
  | "canMarkRead"
  | "canWebSearch"
  | "canCreateLabel"
  | "forwardAllowList"
>;

// API request/response types
export interface UpdateAgentConfigRequest {
  enabled?: boolean;
  canLabel?: boolean;
  canArchive?: boolean;
  canDraftReply?: boolean;
  canMarkRead?: boolean;
  canWebSearch?: boolean;
  canCreateLabel?: boolean;
  forwardAllowList?: string[];
}

export interface CreateAgentDocumentRequest {
  title: string;
  content: string;
  type: AgentDocumentType;
  enabled?: boolean;
  order?: number;
}

export interface UpdateAgentDocumentRequest {
  title?: string;
  content?: string;
  type?: AgentDocumentType;
  enabled?: boolean;
  order?: number;
}

export interface AgentExecutionListParams {
  limit?: number;
  offset?: number;
  status?: AgentExecutionStatus;
}
