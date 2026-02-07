"use client";

import { useCallback, useRef, useState } from "react";
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
  TrashIcon,
  CircleIcon,
} from "lucide-react";
import { cn } from "@/utils";
import type { GetAgentSkillsResponse } from "@/app/api/agent/skills/route";
import type { GetAllowedActionsResponse } from "@/app/api/agent/allowed-actions/route";
import type { GetAgentActivityResponse } from "@/app/api/agent/activity/route";
import { LoadingContent } from "@/components/LoadingContent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { toastSuccess, toastError } from "@/components/Toast";
import {
  toggleAllowedActionAction,
  createSkillAction,
  updateSkillAction,
  deleteSkillAction,
} from "@/utils/actions/agent";
import { useAccount } from "@/providers/EmailAccountProvider";
import type { SimpleRichTextEditorRef } from "@/components/editor/SimpleRichTextEditor";
import { SimpleRichTextEditor } from "@/components/editor/SimpleRichTextEditor";

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

  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);

  const selectedSkill =
    selectedId && selectedId !== "new"
      ? (data?.skills.find((s) => s.id === selectedId) ?? null)
      : null;

  const { execute: executeDelete } = useAction(
    deleteSkillAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Doc deleted" });
        setSelectedId(null);
        mutate();
      },
      onError: () => toastError({ description: "Failed to delete doc" }),
    },
  );

  return (
    <LoadingContent loading={isLoading} error={error}>
      <div className="flex gap-0 overflow-hidden rounded-lg border">
        <SkillSidebar
          skills={data?.skills ?? []}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <div className="min-w-0 flex-1 border-l">
          {selectedId === "new" ? (
            <SkillDetail
              key="new"
              skill={null}
              onSaved={(newId) => {
                mutate();
                if (newId) setSelectedId(newId);
              }}
            />
          ) : selectedSkill ? (
            <SkillDetail
              key={selectedSkill.id}
              skill={selectedSkill}
              onSaved={() => mutate()}
              onDelete={() => executeDelete({ skillId: selectedSkill.id })}
            />
          ) : (
            <div className="flex h-full min-h-[400px] items-center justify-center p-8 text-sm text-muted-foreground">
              Select a doc or create a new one
            </div>
          )}
        </div>
      </div>
    </LoadingContent>
  );
}

function SkillSidebar({
  skills,
  selectedId,
  onSelect,
}: {
  skills: Skill[];
  selectedId: string | "new" | null;
  onSelect: (id: string | "new") => void;
}) {
  return (
    <div className="flex w-56 shrink-0 flex-col">
      <div className="border-b p-2">
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() => onSelect("new")}
        >
          <PlusIcon className="mr-1 h-4 w-4" />
          New Doc
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {skills.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">No docs yet.</p>
        ) : (
          <div className="flex flex-col">
            {skills.map((skill) => (
              <button
                key={skill.id}
                type="button"
                onClick={() => onSelect(skill.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50",
                  selectedId === skill.id && "bg-muted",
                )}
              >
                <CircleIcon
                  className={cn(
                    "h-2 w-2 shrink-0",
                    skill.enabled
                      ? "fill-green-500 text-green-500"
                      : "fill-muted-foreground/30 text-muted-foreground/30",
                  )}
                />
                <span className="truncate">{skill.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SkillDetail({
  skill,
  onSaved,
  onDelete,
}: {
  skill: Skill | null;
  onSaved: (newId?: string) => void;
  onDelete?: () => void;
}) {
  const { emailAccountId } = useAccount();
  const isNew = !skill;

  const [name, setName] = useState(skill?.name ?? "");
  const [description, setDescription] = useState(skill?.description ?? "");
  const [enabled, setEnabled] = useState(skill?.enabled ?? true);
  const editorRef = useRef<SimpleRichTextEditorRef>(null);

  const { execute: executeCreate, isExecuting: isCreating } = useAction(
    createSkillAction.bind(null, emailAccountId),
    {
      onSuccess: (result) => {
        toastSuccess({ description: "Doc created" });
        const newId = (result.data as { id?: string })?.id;
        onSaved(newId);
      },
      onError: () => toastError({ description: "Failed to create doc" }),
    },
  );

  const { execute: executeUpdate, isExecuting: isUpdating } = useAction(
    updateSkillAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Doc saved" });
        onSaved();
      },
      onError: () => toastError({ description: "Failed to save doc" }),
    },
  );

  const isSaving = isCreating || isUpdating;

  const handleSave = useCallback(() => {
    const content = editorRef.current?.getMarkdown() ?? "";
    if (isNew) {
      executeCreate({ name, description, content });
    } else {
      executeUpdate({
        skillId: skill.id,
        name,
        description,
        content,
        enabled,
      });
    }
  }, [isNew, skill, name, description, enabled, executeCreate, executeUpdate]);

  const canSave = name.trim() && description.trim();

  return (
    <div className="flex h-full min-h-[400px] flex-col">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1 py-1">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Doc title"
            className="w-full border-none bg-transparent p-0 text-sm font-medium shadow-none outline-none ring-0 focus:ring-0 placeholder:text-muted-foreground"
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description of this doc"
            className="w-full border-none bg-transparent p-0 text-xs text-muted-foreground shadow-none outline-none ring-0 focus:ring-0 placeholder:text-muted-foreground"
          />
        </div>
        <Button
          size="sm"
          onClick={handleSave}
          loading={isSaving}
          disabled={!canSave}
        >
          {isNew ? "Create" : "Save"}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <SimpleRichTextEditor
          ref={editorRef}
          defaultValue={skill?.content ?? ""}
          placeholder="Markdown instructions for the agent..."
          minHeight={300}
        />
      </div>

      <div className="flex items-center justify-between border-t px-4 py-2">
        <div className="flex items-center gap-2">
          <Switch
            id="skill-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
          <label htmlFor="skill-enabled" className="text-sm">
            {enabled ? "Enabled" : "Disabled"}
          </label>
        </div>
        {!isNew && onDelete && (
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="sm">
                <TrashIcon className="mr-1 h-4 w-4" />
                Delete
              </Button>
            }
            title="Delete doc"
            description={`Are you sure you want to delete "${skill.name}"? This cannot be undone.`}
            onConfirm={onDelete}
          />
        )}
      </div>
    </div>
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
