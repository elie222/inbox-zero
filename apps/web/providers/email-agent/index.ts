// Email Agent Module
// Self-contained Claude Agent SDK integration for email processing

// Types
export type {
  AgentConfig,
  AgentDocument,
  AgentExecution,
  AgentMemory,
  AgentDocumentType,
  AgentExecutionStatus,
  AgentMemoryType,
  AgentConfigWithDocuments,
  AgentConfigWithAll,
  ToolCall,
  AgentExecutionResult,
  AgentContext,
  ProcessEmailWithAgentOptions,
  ToolPermissions,
  UpdateAgentConfigRequest,
  CreateAgentDocumentRequest,
  UpdateAgentDocumentRequest,
  AgentExecutionListParams,
} from "./types";

// Core functions
export { processEmailWithAgent } from "./core/process-email";
export {
  buildAgentSystemPrompt,
  buildEmailUserMessage,
} from "./core/build-prompt";

// API functions
export {
  getAgentConfig,
  getOrCreateAgentConfig,
  getAgentConfigWithAll,
  updateAgentConfig,
  isAgentEnabled,
} from "./api/config";

export {
  getAgentDocuments,
  getAgentDocument,
  createAgentDocument,
  updateAgentDocument,
  deleteAgentDocument,
  getOrCreateMainDocument,
} from "./api/documents";

export {
  getAgentExecutions,
  getAgentExecution,
  recordAgentExecution,
  hasAgentProcessedEmail,
  getAgentExecutionStats,
} from "./api/executions";

// Hooks (client-side)
export { useAgentConfig, useAgentConfigMutation } from "./hooks/useAgentConfig";
export {
  useAgentDocuments,
  useAgentDocument,
  useAgentDocumentsMutation,
} from "./hooks/useAgentDocuments";
export { useAgentExecutions } from "./hooks/useAgentExecutions";

// Server Actions
export {
  toggleAgentEnabledAction,
  updateAgentConfigAction,
  createDocumentAction,
  updateDocumentAction,
  deleteDocumentAction,
  getOrCreateMainDocumentAction,
  initializeAgentConfigAction,
} from "./actions/agent-actions";

// UI Components
export { DocumentEditor } from "./components/DocumentEditor";
export { ActivityFeed } from "./components/ActivityFeed";
export { PermissionToggles } from "./components/PermissionToggles";
