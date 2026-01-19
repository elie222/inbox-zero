"use client";

import useSWR from "swr";
import type { AgentExecution, AgentExecutionStatus } from "../types";

export interface AgentExecutionsResponse {
  executions: AgentExecution[];
  stats?: {
    total: number;
    completed: number;
    skipped: number;
    errors: number;
  };
}

interface UseAgentExecutionsOptions {
  limit?: number;
  offset?: number;
  status?: AgentExecutionStatus;
  includeStats?: boolean;
}

export function useAgentExecutions(options: UseAgentExecutionsOptions = {}) {
  const { limit = 20, offset = 0, status, includeStats = true } = options;

  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    includeStats: String(includeStats),
  });

  if (status) {
    params.set("status", status);
  }

  return useSWR<AgentExecutionsResponse>(
    `/api/user/agent/executions?${params.toString()}`,
  );
}
