"use client";

import { Suspense, useCallback } from "react";
import useSWR from "swr";
import { useAction } from "next-safe-action/hooks";
import { formatDistanceToNow } from "date-fns";
import type { GetAgentSkillsResponse } from "@/app/api/agent/skills/route";
import type { GetAllowedActionsResponse } from "@/app/api/agent/allowed-actions/route";
import type { GetAgentActivityResponse } from "@/app/api/agent/activity/route";
import { AgentChat } from "./chat";
import { LoadingContent } from "@/components/LoadingContent";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toastSuccess, toastError } from "@/components/Toast";
import { toggleAllowedActionAction } from "@/utils/actions/agent";
import { useAccount } from "@/providers/EmailAccountProvider";

export function AgentPage() {
  return (
    <Suspense>
      <Tabs defaultValue="chat" className="flex h-full flex-col">
        <div className="border-b px-4 py-2">
          <TabsList>
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="skills">Skills</TabsTrigger>
            <TabsTrigger value="tools">Tools</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="chat" className="mt-0 flex-1">
          <AgentChat />
        </TabsContent>

        <TabsContent value="activity" className="mt-0 flex-1 overflow-auto p-4">
          <ActivityPanel />
        </TabsContent>

        <TabsContent value="skills" className="mt-0 flex-1 overflow-auto p-4">
          <SkillsPanel />
        </TabsContent>

        <TabsContent value="tools" className="mt-0 flex-1 overflow-auto p-4">
          <ToolsPanel />
        </TabsContent>
      </Tabs>
    </Suspense>
  );
}

const EMAIL_CAPABILITIES = [
  {
    actionType: "archive",
    label: "Archive",
    description: "Archive emails automatically",
  },
  {
    actionType: "classify",
    label: "Label",
    description: "Apply labels to categorize emails",
  },
  {
    actionType: "move",
    label: "Move",
    description: "Move emails to folders",
  },
  {
    actionType: "markRead",
    label: "Mark Read",
    description: "Mark emails as read",
  },
  {
    actionType: "draft",
    label: "Draft",
    description: "Create draft replies",
  },
  {
    actionType: "send",
    label: "Send",
    description: "Send emails (requires approval)",
  },
] as const;

function ActivityPanel() {
  const { data, isLoading, error } = useSWR<GetAgentActivityResponse>(
    "/api/agent/activity",
    { refreshInterval: 30_000 },
  );

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-4 text-lg font-semibold">Activity</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Recent actions taken by the agent on your emails.
      </p>

      <LoadingContent loading={isLoading} error={error}>
        {data?.actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No activity yet. The agent will log actions here when it processes
            emails.
          </p>
        ) : (
          <div className="space-y-1">
            {data?.actions.map((action) => (
              <div
                key={action.id}
                className="flex items-start justify-between gap-4 rounded-lg border p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{action.actionType}</Badge>
                    <StatusBadge status={action.status} />
                  </div>
                  {action.messageSubject && (
                    <p className="mt-1 truncate text-sm">
                      {action.messageSubject}
                    </p>
                  )}
                  {action.error && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      {action.error}
                    </p>
                  )}
                  {action.triggeredBy && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {action.triggeredBy}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(action.createdAt), {
                    addSuffix: true,
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </LoadingContent>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "SUCCESS":
      return <Badge variant="green">success</Badge>;
    case "FAILED":
      return <Badge variant="red">failed</Badge>;
    case "BLOCKED":
      return <Badge variant="outline">blocked</Badge>;
    case "PENDING_APPROVAL":
      return <Badge variant="outline">pending approval</Badge>;
    case "PENDING":
      return <Badge variant="secondary">pending</Badge>;
    case "CANCELLED":
      return <Badge variant="secondary">cancelled</Badge>;
    default:
      return <Badge variant="secondary">{status.toLowerCase()}</Badge>;
  }
}

function SkillsPanel() {
  const { data, isLoading, error } =
    useSWR<GetAgentSkillsResponse>("/api/agent/skills");

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-4 text-lg font-semibold">Skills</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Skills are reusable instructions the agent can reference when processing
        emails.
      </p>

      <LoadingContent loading={isLoading} error={error}>
        {data?.skills.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No skills yet. Chat with the agent to create skills.
          </p>
        ) : (
          <div className="space-y-3">
            {data?.skills.map((skill) => (
              <div key={skill.id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{skill.name}</span>
                    <Badge
                      variant={
                        skill.status === "ACTIVE" ? "green" : "secondary"
                      }
                    >
                      {skill.status.toLowerCase()}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      v{skill.version}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    used {skill.useCount} time
                    {skill.useCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {skill.description}
                </p>
              </div>
            ))}
          </div>
        )}
      </LoadingContent>
    </div>
  );
}

function ToolsPanel() {
  const { emailAccountId, provider } = useAccount();
  const { data, isLoading, error, mutate } = useSWR<GetAllowedActionsResponse>(
    "/api/agent/allowed-actions",
  );

  const { execute, isExecuting } = useAction(
    toggleAllowedActionAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Updated" });
        mutate();
      },
      onError: () => {
        toastError({ description: "Failed to update" });
      },
    },
  );

  const isEnabled = useCallback(
    (actionType: string) => {
      return (
        data?.allowedActions.find((a) => a.actionType === actionType)
          ?.enabled ?? false
      );
    },
    [data?.allowedActions],
  );

  const capabilities =
    provider === "google"
      ? EMAIL_CAPABILITIES.filter((cap) => cap.actionType !== "move")
      : EMAIL_CAPABILITIES;

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-4 text-lg font-semibold">Email Processing</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Control what the agent can do when it processes incoming emails.
      </p>

      <LoadingContent loading={isLoading} error={error}>
        <div className="space-y-1">
          {capabilities.map((cap) => (
            <div
              key={cap.actionType}
              className="flex items-center justify-between rounded-lg border p-4"
            >
              <div>
                <span className="font-medium">{cap.label}</span>
                <p className="text-sm text-muted-foreground">
                  {cap.description}
                </p>
              </div>
              <Switch
                checked={isEnabled(cap.actionType)}
                disabled={isExecuting}
                onCheckedChange={(checked) => {
                  execute({ actionType: cap.actionType, enabled: checked });
                }}
              />
            </div>
          ))}
        </div>
      </LoadingContent>
    </div>
  );
}
