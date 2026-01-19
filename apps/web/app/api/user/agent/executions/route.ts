import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import {
  getAgentExecutions,
  getAgentExecutionStats,
  type AgentExecution,
  type AgentExecutionStatus,
} from "@/providers/email-agent";

export type AgentExecutionsResponse = {
  executions: AgentExecution[];
  stats?: {
    total: number;
    completed: number;
    skipped: number;
    errors: number;
  };
};

export const GET = withEmailAccount(
  "user/agent/executions",
  async (request) => {
    const emailAccountId = request.auth.emailAccountId;
    const url = new URL(request.url);

    const limit = Number.parseInt(url.searchParams.get("limit") || "50", 10);
    const offset = Number.parseInt(url.searchParams.get("offset") || "0", 10);
    const status = url.searchParams.get(
      "status",
    ) as AgentExecutionStatus | null;
    const includeStats = url.searchParams.get("includeStats") === "true";

    const executions = await getAgentExecutions(emailAccountId, {
      limit: Math.min(limit, 100),
      offset,
      ...(status && { status }),
    });

    const response: AgentExecutionsResponse = { executions };

    if (includeStats) {
      response.stats = await getAgentExecutionStats(emailAccountId);
    }

    return NextResponse.json(response);
  },
);
