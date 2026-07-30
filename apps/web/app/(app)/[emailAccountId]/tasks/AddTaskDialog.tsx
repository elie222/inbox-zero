"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import type { TaskPriority } from "@/generated/prisma/enums";
import {
  TASK_PRIORITY_CHIP_ACTIVE_CLASS,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_ORDER,
} from "@/utils/tasks";
import { createTaskAction } from "@/utils/actions/task";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getActionErrorMessage } from "@/utils/error";
import { toastError, toastSuccess } from "@/components/Toast";
import { cn } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AssigneeAutocomplete } from "./AssigneeAutocomplete";

const EMPTY_DRAFT = {
  title: "",
  description: "",
  assignee: "",
  due: "",
  priority: "NORMAL" as TaskPriority,
};

export function AddTaskDialog({
  open,
  onClose,
  mutate,
}: {
  open: boolean;
  onClose: () => void;
  mutate: () => void;
}) {
  const { emailAccountId } = useAccount();
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  const create = useAction(createTaskAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Task added" });
      mutate();
      closeAndReset();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  // The dialog stays mounted, so its draft survives a close; clear it on
  // every close path (cancel, Escape, outside-click) to avoid a stale draft
  const closeAndReset = () => {
    setDraft(EMPTY_DRAFT);
    onClose();
  };

  const submit = () => {
    if (!draft.title.trim() || create.isExecuting) return;
    create.execute({
      title: draft.title,
      description: draft.description,
      assigneeEmail: draft.assignee.trim(),
      dueAt: draft.due ? new Date(draft.due).toISOString() : null,
      priority: draft.priority,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeAndReset()}>
      <DialogContent className="max-w-[480px]">
        <DialogTitle className="font-display text-[22px] font-normal tracking-tight">
          Add task
        </DialogTitle>
        <div className="flex flex-col gap-3.5">
          <div>
            <Label htmlFor="new-task-title">Title</Label>
            <Input
              id="new-task-title"
              className="mt-2"
              autoFocus
              placeholder="What needs to happen?"
              value={draft.title}
              onChange={(event) =>
                setDraft((d) => ({ ...d, title: event.target.value }))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
            />
          </div>
          <div>
            <Label htmlFor="new-task-description">Description</Label>
            <Textarea
              id="new-task-description"
              className="mt-2"
              rows={3}
              value={draft.description}
              onChange={(event) =>
                setDraft((d) => ({ ...d, description: event.target.value }))
              }
            />
          </div>
          {/* An email input and a datetime-local don't fit side by side on a
              phone; stack them there */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div>
              <Label htmlFor="new-task-assignee">Assignee</Label>
              <div className="mt-2">
                <AssigneeAutocomplete
                  id="new-task-assignee"
                  value={draft.assignee}
                  onChange={(assignee) => setDraft((d) => ({ ...d, assignee }))}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="new-task-due">Due</Label>
              <Input
                id="new-task-due"
                type="datetime-local"
                className="mt-2"
                value={draft.due}
                onChange={(event) =>
                  setDraft((d) => ({ ...d, due: event.target.value }))
                }
              />
            </div>
          </div>
          <div>
            <Label>Priority</Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {TASK_PRIORITY_ORDER.map((priority) => (
                <button
                  key={priority}
                  type="button"
                  className={cn(
                    "inline-flex h-[30px] items-center whitespace-nowrap rounded-full border px-3 text-[12.5px] font-medium",
                    draft.priority === priority
                      ? TASK_PRIORITY_CHIP_ACTIVE_CLASS[priority]
                      : "border-border text-muted-foreground hover:border-muted-foreground/40",
                  )}
                  onClick={() => setDraft((d) => ({ ...d, priority }))}
                >
                  {TASK_PRIORITY_LABELS[priority]}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closeAndReset}>
              Cancel
            </Button>
            <Button
              type="button"
              loading={create.isExecuting}
              disabled={!draft.title.trim()}
              onClick={submit}
            >
              Add task
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
