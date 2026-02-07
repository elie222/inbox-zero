"use client";

import { useCallback, useRef, useState } from "react";
import useSWR from "swr";
import { useAction } from "next-safe-action/hooks";
import { PlusIcon, TrashIcon, CircleIcon } from "lucide-react";
import { cn } from "@/utils";
import type { GetAgentSkillsResponse } from "@/app/api/agent/skills/route";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { toastSuccess, toastError } from "@/components/Toast";
import {
  createSkillAction,
  updateSkillAction,
  deleteSkillAction,
} from "@/utils/actions/agent";
import { useAccount } from "@/providers/EmailAccountProvider";
import type { SimpleRichTextEditorRef } from "@/components/editor/SimpleRichTextEditor";
import { SimpleRichTextEditor } from "@/components/editor/SimpleRichTextEditor";

type Skill = GetAgentSkillsResponse["skills"][number];

export function KnowledgePanel() {
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
        <DocSidebar
          skills={data?.skills ?? []}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <div className="min-w-0 flex-1 border-l">
          {selectedId === "new" ? (
            <DocDetail
              key="new"
              skill={null}
              onSaved={(newId) => {
                mutate();
                if (newId) setSelectedId(newId);
              }}
            />
          ) : selectedSkill ? (
            <DocDetail
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

function DocSidebar({
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

function DocDetail({
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
