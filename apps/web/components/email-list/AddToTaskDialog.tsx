"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { useAction } from "next-safe-action/hooks";
import { PlusIcon } from "lucide-react";
import type { Thread } from "@/components/email-list/types";
import type { TasksResponse } from "@/app/api/tasks/route";
import type { LinkTaskEmailBody } from "@/utils/actions/task.validation";
import { createTaskAction, linkTaskEmailAction } from "@/utils/actions/task";
import {
  isTaskOpen,
  TASK_STATUS_LABELS,
  TASK_STATUS_STYLES,
} from "@/utils/tasks";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getActionErrorMessage } from "@/utils/error";
import { extractNameFromEmail } from "@/utils/email";
import { internalDateToDate } from "@/utils/date";
import { cn } from "@/utils";
import { toastError, toastSuccess } from "@/components/Toast";
import { LoadingContent } from "@/components/LoadingContent";
import { SearchBar } from "@/components/SearchBar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// "Add to task" from the mail list: link this email to an existing open
// task, or spin up a new task from it. The task's AI reads linked emails to
// keep its status current.
export function AddToTaskDialog({
  thread,
  onClose,
}: {
  thread: Thread;
  onClose: () => void;
}) {
  const { emailAccountId } = useAccount();
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useSWR<TasksResponse>("/api/tasks");

  const link = useAction(linkTaskEmailAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Email linked to task" });
      onClose();
    },
    onError: (actionError) => {
      toastError({ description: getActionErrorMessage(actionError.error) });
    },
  });

  const create = useAction(createTaskAction.bind(null, emailAccountId), {
    onSuccess: ({ data: result }) => {
      const taskId = result?.task.id;
      if (taskId) {
        link.execute({ ...emailPayload(thread), taskId });
      }
      toastSuccess({ description: "Task created from email" });
    },
    onError: (actionError) => {
      toastError({ description: getActionErrorMessage(actionError.error) });
    },
  });

  const term = search.trim().toLowerCase();
  const tasks = useMemo(
    () =>
      (data?.tasks ?? [])
        .filter((task) => isTaskOpen(task.status))
        .filter(
          (task) =>
            !term ||
            [task.title, task.description, task.assigneeEmail]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(term),
        ),
    [data, term],
  );

  const message = thread.messages.at(-1);
  const busy = link.isExecuting || create.isExecuting;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add to task</DialogTitle>
        </DialogHeader>
        <p className="break-words text-sm text-muted-foreground">
          Link “{message?.headers.subject || "(no subject)"}” to a task. The AI
          reads linked emails to keep the task's status current.
        </p>
        <SearchBar onSearch={setSearch} placeholder="Search open tasks..." />
        <LoadingContent loading={isLoading && !data} error={error}>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
            {tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                disabled={busy}
                className="flex w-full items-center gap-2.5 border-b border-border/70 px-3 py-2.5 text-left last:border-b-0 hover:bg-muted/40"
                onClick={() =>
                  link.execute({ ...emailPayload(thread), taskId: task.id })
                }
              >
                <span
                  title={TASK_STATUS_LABELS[task.status]}
                  className={cn(
                    "size-2.5 shrink-0 rounded-full",
                    TASK_STATUS_STYLES[task.status].dot,
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {task.title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {task.assigneeEmail ? `→ ${task.assigneeEmail}` : "Mine"}
                  </span>
                </span>
              </button>
            ))}
            {!tasks.length && (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                {term ? "No open tasks match." : "No open tasks yet."}
              </p>
            )}
          </div>
        </LoadingContent>
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          loading={busy}
          onClick={() =>
            create.execute({
              title: message?.headers.subject || "Follow up on email",
              sourceThreadId: thread.id,
              sourceMessageId: message?.id,
            })
          }
        >
          <PlusIcon className="mr-1.5 size-3.5" />
          New task from this email
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// Cached display fields for the linked-email card, from the thread's latest
// message
function emailPayload(thread: Thread): Omit<LinkTaskEmailBody, "taskId"> {
  const message = thread.messages.at(-1);
  const date = message ? internalDateToDate(message.internalDate) : null;
  return {
    threadId: thread.id,
    messageId: message?.id ?? thread.id,
    from: message ? extractNameFromEmail(message.headers.from) : "Unknown",
    subject: message?.headers.subject ?? "",
    snippet: thread.snippet || null,
    receivedAt:
      date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
  };
}
