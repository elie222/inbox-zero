"use client";

import useSWR from "swr";
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
import type { GetAgentActivityResponse } from "@/app/api/agent/activity/route";
import { LoadingContent } from "@/components/LoadingContent";
import { Badge } from "@/components/ui/badge";

type ActivityAction = GetAgentActivityResponse["actions"][number];

export function ActivityPanel() {
  const { data, isLoading, error } = useSWR<GetAgentActivityResponse>(
    "/api/agent/activity",
    { refreshInterval: 30_000 },
  );

  const groups = data ? groupActionsByThread(data.actions) : [];

  return (
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
            const status = getGroupStatus(group);
            const subject = group[0].messageSubject;
            const errorMsg = group.find((a) => a.error)?.error;
            const isLast = i === groups.length - 1;
            const actionDescriptions = group.map(describeAction);
            const primaryText = subject || describeGroup(group);

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
                    <p className="truncate text-sm">
                      <span className="font-medium">{primaryText}</span>
                      {status && (
                        <StatusBadge status={status} className="ml-2" />
                      )}
                    </p>
                    {subject && (
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {actionDescriptions.join(" · ")}
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
