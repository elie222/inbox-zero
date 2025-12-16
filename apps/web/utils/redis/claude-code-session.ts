/**
 * Claude Code session management for Redis.
 *
 * This module provides session persistence for Claude Code CLI operations,
 * enabling conversation continuity across related AI operations.
 *
 * Sessions are grouped by workflow type (report, rules, clean, default)
 * so that related operations share conversational context.
 */

import "server-only";

import { redis } from "@/utils/redis";

// Session TTL: 30 minutes (refreshed on each access)
const SESSION_TTL_SECONDS = 30 * 60;

/**
 * Workflow groups for session scoping.
 * Related AI operations share a session within their workflow group.
 */
export type WorkflowGroup = "report" | "rules" | "clean" | "default";

/**
 * Session data stored in Redis.
 */
export interface ClaudeCodeSessionData {
  sessionId: string;
  lastUsedAt: string; // ISO timestamp
}

/**
 * Mapping of task labels to workflow groups.
 * Labels not in this map default to "default" group.
 */
const WORKFLOW_LABEL_MAPPING: Record<string, WorkflowGroup> = {
  // Report workflow - all email report related tasks
  "email-report-email-behavior": "report",
  "email-report-executive-summary": "report",
  "email-report-user-persona": "report",
  "email-report-response-patterns": "report",
  "email-report-summary-generation": "report",
  "email-report-actionable-recommendations": "report",
  "email-report-label-analysis": "report",

  // Rules workflow - rule creation and management
  "Prompt to rules": "rules",
  "Generate rules prompt": "rules",
  "Find existing rules": "rules",
  "Diff rules": "rules",

  // Clean workflow - inbox cleaning operations
  Clean: "clean",
  "Clean - Select Labels": "clean",
};

/**
 * Get the workflow group for a given task label.
 * Unknown labels default to "default" group.
 */
export function getWorkflowGroupFromLabel(label: string): WorkflowGroup {
  return WORKFLOW_LABEL_MAPPING[label] ?? "default";
}

/**
 * Generate Redis key for a session.
 * Format: claude-session:{userEmail}:{workflowGroup}
 */
function getSessionKey(
  userEmail: string,
  workflowGroup: WorkflowGroup,
): string {
  return `claude-session:${userEmail}:${workflowGroup}`;
}

/**
 * Retrieve an existing Claude Code session from Redis.
 * Returns null if the session doesn't exist or has expired.
 */
export async function getClaudeCodeSession({
  userEmail,
  workflowGroup,
}: {
  userEmail: string;
  workflowGroup: WorkflowGroup;
}): Promise<ClaudeCodeSessionData | null> {
  const key = getSessionKey(userEmail, workflowGroup);
  const session = await redis.get<ClaudeCodeSessionData>(key);
  return session ?? null;
}

/**
 * Save a Claude Code session to Redis with TTL refresh.
 * Creates a new session or updates an existing one.
 */
export async function saveClaudeCodeSession({
  userEmail,
  workflowGroup,
  sessionId,
}: {
  userEmail: string;
  workflowGroup: WorkflowGroup;
  sessionId: string;
}): Promise<void> {
  const key = getSessionKey(userEmail, workflowGroup);
  const sessionData: ClaudeCodeSessionData = {
    sessionId,
    lastUsedAt: new Date().toISOString(),
  };

  await redis.set(key, sessionData, { ex: SESSION_TTL_SECONDS });
}

/**
 * Delete a Claude Code session from Redis.
 * Useful for explicit cleanup if needed.
 */
export async function deleteClaudeCodeSession({
  userEmail,
  workflowGroup,
}: {
  userEmail: string;
  workflowGroup: WorkflowGroup;
}): Promise<void> {
  const key = getSessionKey(userEmail, workflowGroup);
  await redis.del(key);
}
