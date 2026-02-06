"use client";

import { Suspense, useCallback } from "react";
import useSWR from "swr";
import { useAction } from "next-safe-action/hooks";
import { formatDistanceToNow } from "date-fns";
import {
  ArchiveIcon,
  TagIcon,
  FolderInputIcon,
  EyeIcon,
  PenLineIcon,
  SendIcon,
  SettingsIcon,
  MailIcon,
} from "lucide-react";
import { cn } from "@/utils";
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

type ActivityAction = GetAgentActivityResponse["actions"][number];

function ActivityPanel() {
  const { data, isLoading, error } = useSWR<GetAgentActivityResponse>(
    "/api/agent/activity",
    { refreshInterval: 30_000 },
  );

  const groups = data ? groupActionsByThread(data.actions) : [];

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-4 text-lg font-semibold">Activity</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Recent actions taken by the agent on your emails.
      </p>

      <LoadingContent loading={isLoading} error={error}>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No activity yet. The agent will log actions here when it processes
            emails.
          </p>
        ) : (
          <div className="relative">
            {groups.map((group, i) => {
              const Icon = getGroupIcon(group);
              const description = describeGroup(group);
              const status = getGroupStatus(group);
              const subject = group[0].messageSubject;
              const errorMsg = group.find((a) => a.error)?.error;
              const isLast = i === groups.length - 1;

              return (
                <div key={group[0].id} className="relative flex gap-3 pb-6">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        status
                          ? "bg-muted text-muted-foreground"
                          : "bg-primary/10 text-primary",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    {!isLast && <div className="w-px flex-1 bg-border" />}
                  </div>

                  <div className="flex min-w-0 flex-1 items-start justify-between pt-1">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{description}</span>
                        {status && (
                          <StatusBadge status={status} className="ml-2" />
                        )}
                      </p>
                      {subject && (
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">
                          {subject}
                        </p>
                      )}
                      {status === "FAILED" && errorMsg && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          {errorMsg}
                        </p>
                      )}
                      {status === "BLOCKED" && errorMsg && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {errorMsg}
                        </p>
                      )}
                    </div>
                    <span className="ml-4 shrink-0 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(group[0].createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </LoadingContent>
    </div>
  );
}

function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  switch (status) {
    case "FAILED":
      return (
        <Badge variant="red" className={className}>
          Failed
        </Badge>
      );
    case "BLOCKED":
      return (
        <Badge variant="secondary" className={className}>
          Blocked
        </Badge>
      );
    case "PENDING_APPROVAL":
      return (
        <Badge variant="outline" className={className}>
          Pending approval
        </Badge>
      );
    case "PENDING":
      return (
        <Badge variant="secondary" className={className}>
          Pending
        </Badge>
      );
    case "CANCELLED":
      return (
        <Badge variant="secondary" className={className}>
          Cancelled
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className={className}>
          {status.toLowerCase()}
        </Badge>
      );
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

function groupActionsByThread(actions: ActivityAction[]): ActivityAction[][] {
  const groups: ActivityAction[][] = [];
  const threadMap = new Map<string, ActivityAction[]>();

  for (const action of actions) {
    if (action.threadId) {
      const existing = threadMap.get(action.threadId);
      if (existing) {
        existing.push(action);
      } else {
        const group = [action];
        threadMap.set(action.threadId, group);
        groups.push(group);
      }
    } else {
      groups.push([action]);
    }
  }

  return groups;
}

function describeAction(action: ActivityAction): string {
  const data = action.actionData as Record<string, unknown> | null;
  const targetName = data?.targetName as string | undefined;

  switch (action.actionType) {
    case "archive":
      return "Archived";
    case "classify":
      return targetName ? `Labeled as '${targetName}'` : "Labeled";
    case "move":
      return targetName ? `Moved to '${targetName}'` : "Moved";
    case "draft":
      return "Drafted a reply";
    case "send":
      return "Sent an email";
    case "markRead":
      return "Marked as read";
    default:
      return action.actionType;
  }
}

function describeGroup(actions: ActivityAction[]): string {
  const descriptions = actions.map(describeAction);
  if (descriptions.length === 1) return descriptions[0];
  if (descriptions.length === 2)
    return `${descriptions[0]} and ${descriptions[1].toLowerCase()}`;
  return (
    descriptions.slice(0, -1).join(", ") +
    `, and ${descriptions[descriptions.length - 1].toLowerCase()}`
  );
}

const ACTION_ICON_PRIORITY: Record<string, number> = {
  send: 6,
  draft: 5,
  classify: 4,
  move: 3,
  markRead: 2,
  archive: 1,
};

const ACTION_ICONS: Record<string, typeof MailIcon> = {
  archive: ArchiveIcon,
  classify: TagIcon,
  move: FolderInputIcon,
  markRead: EyeIcon,
  draft: PenLineIcon,
  send: SendIcon,
  updateSettings: SettingsIcon,
};

function getGroupIcon(actions: ActivityAction[]): typeof MailIcon {
  let best = actions[0];
  for (const action of actions) {
    if (
      (ACTION_ICON_PRIORITY[action.actionType] ?? 0) >
      (ACTION_ICON_PRIORITY[best.actionType] ?? 0)
    ) {
      best = action;
    }
  }
  return ACTION_ICONS[best.actionType] ?? MailIcon;
}

function getGroupStatus(actions: ActivityAction[]): string | null {
  for (const action of actions) {
    if (action.status !== "SUCCESS") return action.status;
  }
  return null;
}
