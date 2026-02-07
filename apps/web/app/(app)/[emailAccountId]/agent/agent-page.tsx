"use client";

import { useCallback, useState } from "react";
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
  PlusIcon,
  PencilIcon,
  TrashIcon,
} from "lucide-react";
import { cn } from "@/utils";
import type { GetAgentSkillsResponse } from "@/app/api/agent/skills/route";
import type { GetAllowedActionsResponse } from "@/app/api/agent/allowed-actions/route";
import type { GetAgentActivityResponse } from "@/app/api/agent/activity/route";
import { LoadingContent } from "@/components/LoadingContent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { toastSuccess, toastError } from "@/components/Toast";
import {
  toggleAllowedActionAction,
  createSkillAction,
  updateSkillAction,
  deleteSkillAction,
} from "@/utils/actions/agent";
import { useAccount } from "@/providers/EmailAccountProvider";

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

type Skill = GetAgentSkillsResponse["skills"][number];

export function SkillsPanel() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } =
    useSWR<GetAgentSkillsResponse>("/api/agent/skills");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);

  const { execute: executeDelete } = useAction(
    deleteSkillAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Skill deleted" });
        mutate();
      },
      onError: () => toastError({ description: "Failed to delete skill" }),
    },
  );

  const { execute: executeUpdate, isExecuting: isUpdatingStatus } = useAction(
    updateSkillAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Skill updated" });
        mutate();
      },
      onError: () => toastError({ description: "Failed to update skill" }),
    },
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Reusable instructions the agent can reference when processing emails.
        </p>
        <Button
          size="sm"
          className="ml-4 shrink-0"
          onClick={() => {
            setEditingSkill(null);
            setDialogOpen(true);
          }}
        >
          <PlusIcon className="mr-1 h-4 w-4" />
          New Skill
        </Button>
      </div>

      <LoadingContent loading={isLoading} error={error}>
        {data?.skills.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No skills yet. Create one or chat with the agent.
          </p>
        ) : (
          <div className="space-y-3">
            {data?.skills.map((skill) => (
              <div key={skill.id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{skill.name}</span>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={skill.enabled}
                      disabled={isUpdatingStatus}
                      onCheckedChange={(checked) => {
                        executeUpdate({
                          skillId: skill.id,
                          enabled: checked,
                        });
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        setEditingSkill(skill);
                        setDialogOpen(true);
                      }}
                    >
                      <PencilIcon className="h-4 w-4" />
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      }
                      title="Delete skill"
                      description={`Are you sure you want to delete "${skill.name}"? This cannot be undone.`}
                      onConfirm={() => executeDelete({ skillId: skill.id })}
                    />
                  </div>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {skill.description}
                </p>
              </div>
            ))}
          </div>
        )}
      </LoadingContent>

      <SkillDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        skill={editingSkill}
        onSaved={mutate}
      />
    </div>
  );
}

function SkillDialog({
  open,
  onOpenChange,
  skill,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skill: Skill | null;
  onSaved: () => void;
}) {
  const { emailAccountId } = useAccount();
  const isEditing = !!skill;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");

  const resetForm = useCallback(() => {
    setName(skill?.name ?? "");
    setDescription(skill?.description ?? "");
    setContent(skill?.content ?? "");
  }, [skill]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) resetForm();
      onOpenChange(nextOpen);
    },
    [onOpenChange, resetForm],
  );

  const { execute: executeCreate, isExecuting: isCreating } = useAction(
    createSkillAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Skill created" });
        onOpenChange(false);
        onSaved();
      },
      onError: () => toastError({ description: "Failed to create skill" }),
    },
  );

  const { execute: executeUpdate, isExecuting: isUpdating } = useAction(
    updateSkillAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Skill updated" });
        onOpenChange(false);
        onSaved();
      },
      onError: () => toastError({ description: "Failed to update skill" }),
    },
  );

  const isSaving = isCreating || isUpdating;

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isEditing) {
        executeUpdate({
          skillId: skill.id,
          name,
          description,
          content,
        });
      } else {
        executeCreate({ name, description, content });
      }
    },
    [
      isEditing,
      skill,
      name,
      description,
      content,
      executeCreate,
      executeUpdate,
    ],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Skill" : "New Skill"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="text"
            name="name"
            label="Name"
            placeholder="e.g. conversation-status"
            registerProps={{
              value: name,
              onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                setName(e.target.value),
            }}
          />
          <Input
            type="text"
            name="description"
            label="Description"
            placeholder="When to use this skill"
            registerProps={{
              value: description,
              onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                setDescription(e.target.value),
            }}
          />
          <div className="space-y-2">
            <Label htmlFor="skill-content">Content</Label>
            <Textarea
              id="skill-content"
              placeholder="Markdown instructions for the agent..."
              rows={8}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={isSaving}
              disabled={!name || !description || !content}
            >
              {isEditing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ToolsPanel() {
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
    <LoadingContent loading={isLoading} error={error}>
      <div className="space-y-1">
        {capabilities.map((cap) => (
          <div
            key={cap.actionType}
            className="flex items-center justify-between rounded-lg border p-4"
          >
            <div>
              <span className="font-medium">{cap.label}</span>
              <p className="text-sm text-muted-foreground">{cap.description}</p>
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
