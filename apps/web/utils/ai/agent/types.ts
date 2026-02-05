import type { Logger } from "@/utils/logger";

export type AgentToolContext = {
  emailAccountId: string;
  emailAccountEmail: string;
  provider: string;
  resourceType: string;
  logger: Logger;
  dryRun?: boolean;
};

export type AgentToolContextWithEmail = AgentToolContext & {
  emailId: string;
  threadId?: string;
};

export type AgentActionType =
  | "archive"
  | "label"
  | "moveFolder"
  | "markRead"
  | "draft"
  | "send"
  | "updateSettings";

type InternalActionType =
  | "archive"
  | "classify"
  | "move"
  | "markRead"
  | "draft"
  | "send"
  | "updateSettings";

export function normalizeAgentActionType(
  type: AgentActionType | InternalActionType,
) {
  if (type === "label") return "classify";
  if (type === "moveFolder") return "move";
  return type;
}

export type SettingsUpdatePayload = {
  allowedActions?: Array<{
    actionType: string;
    resourceType?: string | null;
    enabled?: boolean;
    config?: unknown;
    conditions?: unknown;
  }>;
  allowedActionOptions?: Array<{
    actionType: string;
    resourceType?: string | null;
    provider: string;
    kind: string;
    externalId?: string | null;
    name: string;
    targetGroup?: {
      name: string;
      cardinality: "SINGLE" | "MULTI";
      appliesToResourceType?: string | null;
    };
    delete?: boolean;
  }>;
};

export type StructuredAction =
  | {
      type: "archive";
      resourceId: string;
    }
  | {
      type: "markRead";
      resourceId: string;
      read?: boolean;
    }
  | {
      type: "label";
      resourceId: string;
      targetExternalId?: string;
      targetName?: string;
    }
  | {
      type: "moveFolder";
      resourceId: string;
      targetExternalId?: string;
      targetName?: string;
    }
  | {
      type: "draft";
      resourceId: string;
      content: string;
      subject?: string;
      to?: string;
      cc?: string;
      bcc?: string;
    }
  | {
      type: "send";
      resourceId?: string;
      draftId?: string;
      content?: string;
      subject?: string;
      to?: string;
      cc?: string;
      bcc?: string;
    }
  | {
      type: "updateSettings";
      settings: SettingsUpdatePayload;
    };

export type NormalizedStructuredAction = Omit<StructuredAction, "type"> & {
  type: InternalActionType;
};

export function normalizeStructuredAction(
  action: StructuredAction,
): NormalizedStructuredAction {
  return {
    ...action,
    type: normalizeAgentActionType(action.type),
  };
}

export type ActionContext = {
  emailAccountId: string;
  provider: string;
  resourceType: string;
  emailId?: string;
  threadId?: string;
  messageSubject?: string;
  triggeredBy: string;
  patternId?: string;
  skillId?: string;
  dryRun?: boolean;
};

export type ExecutionResult = {
  success: boolean;
  logId?: string;
  requiresApproval?: boolean;
  approvalId?: string;
  reason?: string;
  error?: string;
  validation?: unknown;
  artifactId?: string;
  draftId?: string;
};

export type ExecuteActionFn = (
  action: StructuredAction,
  context: ActionContext,
) => Promise<ExecutionResult>;
