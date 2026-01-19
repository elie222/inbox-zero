"use client";

import { useState } from "react";
import {
  CheckCircle2Icon,
  XCircleIcon,
  SkipForwardIcon,
  Loader2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "lucide-react";
import { cn } from "@/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingContent } from "@/components/LoadingContent";
import { MutedText } from "@/components/Typography";
import { useAgentExecutions } from "../hooks/useAgentExecutions";
import type { AgentExecution, ToolCall, AgentExecutionStatus } from "../types";

const statusConfig: Record<
  AgentExecutionStatus,
  { icon: React.ReactNode; label: string; className: string }
> = {
  PROCESSING: {
    icon: <Loader2Icon className="h-4 w-4 animate-spin" />,
    label: "Processing",
    className: "text-blue-600 dark:text-blue-400",
  },
  COMPLETED: {
    icon: <CheckCircle2Icon className="h-4 w-4" />,
    label: "Completed",
    className: "text-green-600 dark:text-green-400",
  },
  SKIPPED: {
    icon: <SkipForwardIcon className="h-4 w-4" />,
    label: "Skipped",
    className: "text-gray-500 dark:text-gray-400",
  },
  ERROR: {
    icon: <XCircleIcon className="h-4 w-4" />,
    label: "Error",
    className: "text-red-600 dark:text-red-400",
  },
};

export function ActivityFeed() {
  const { data, isLoading, error } = useAgentExecutions({ limit: 20 });

  return (
    <div className="flex flex-col h-full">
      {data?.stats && (
        <div className="grid grid-cols-4 gap-2 mb-4">
          <StatCard label="Total" value={data.stats.total} />
          <StatCard
            label="Completed"
            value={data.stats.completed}
            className="text-green-600"
          />
          <StatCard
            label="Skipped"
            value={data.stats.skipped}
            className="text-gray-500"
          />
          <StatCard
            label="Errors"
            value={data.stats.errors}
            className="text-red-600"
          />
        </div>
      )}

      <LoadingContent loading={isLoading} error={error}>
        <div className="flex-1 overflow-auto space-y-2">
          {data?.executions.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No activity yet. Enable the agent to start processing emails.
            </div>
          ) : (
            data?.executions.map((execution) => (
              <ExecutionCard key={execution.id} execution={execution} />
            ))
          )}
        </div>
      </LoadingContent>
    </div>
  );
}

function StatCard({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className="text-center p-2 rounded-md bg-muted/50">
      <div className={cn("text-lg font-semibold", className)}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function ExecutionCard({ execution }: { execution: AgentExecution }) {
  const [expanded, setExpanded] = useState(false);
  const config = statusConfig[execution.status];
  const toolCalls = execution.toolCalls as ToolCall[] | null;

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className={cn("mt-0.5", config.className)}>{config.icon}</div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={cn("text-sm font-medium", config.className)}>
                  {config.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(execution.createdAt).toLocaleString()}
                </span>
              </div>

              {(execution.reasoning || (toolCalls && toolCalls.length > 0)) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setExpanded(!expanded)}
                >
                  {expanded ? (
                    <ChevronUpIcon className="h-4 w-4" />
                  ) : (
                    <ChevronDownIcon className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>

            {execution.reasoning && !expanded && (
              <MutedText className="text-sm truncate mt-1">
                {execution.reasoning.slice(0, 100)}
                {execution.reasoning.length > 100 ? "..." : ""}
              </MutedText>
            )}

            {expanded && (
              <div className="mt-3 space-y-3">
                {execution.reasoning && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      Reasoning
                    </div>
                    <div className="text-sm whitespace-pre-wrap bg-muted/50 rounded-md p-2">
                      {execution.reasoning}
                    </div>
                  </div>
                )}

                {toolCalls && toolCalls.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      Actions ({toolCalls.length})
                    </div>
                    <div className="space-y-1">
                      {toolCalls.map((call, idx) => (
                        <ToolCallItem key={idx} call={call} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ToolCallItem({ call }: { call: ToolCall }) {
  const hasError = !!call.error;

  return (
    <div
      className={cn(
        "text-xs rounded-md p-2 font-mono",
        hasError ? "bg-red-50 dark:bg-red-950/20" : "bg-muted/50",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-semibold">{call.name}</span>
        {hasError && <span className="text-red-600">Failed</span>}
      </div>
      {Object.keys(call.args).length > 0 && (
        <div className="mt-1 text-muted-foreground">
          {JSON.stringify(call.args, null, 2)}
        </div>
      )}
      {call.error && <div className="mt-1 text-red-600">{call.error}</div>}
    </div>
  );
}
