"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { formatDistanceToNow } from "date-fns";
import { PlusIcon } from "lucide-react";
import type { TasksResponse } from "@/app/api/tasks/route";
import {
  isTaskOpen,
  isTaskOverdue,
  type TaskListItem,
  TASK_STATUS_LABELS,
} from "@/utils/tasks";
import type { TaskStatus } from "@/generated/prisma/enums";
import { cn } from "@/utils";
import { SearchBar } from "@/components/SearchBar";
import { LoadingContent } from "@/components/LoadingContent";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/ui/button";
import { TaskDetail } from "./TaskDetail";
import { AddTaskDialog } from "./AddTaskDialog";
import { useIsWideScreen } from "./useIsWideScreen";

export function TasksList() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  const statusFilter = searchParams.get("status") as TaskStatus | null;

  const { data, isLoading, error, mutate } = useSWR<TasksResponse>(
    "/api/tasks",
    { keepPreviousData: true },
  );

  const tasks = data?.tasks ?? [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (statusFilter && task.status !== statusFilter) return false;
      if (
        view === "delegated" &&
        (!task.assigneeEmail || !isTaskOpen(task.status))
      )
        return false;
      if (view === "overdue" && !isTaskOverdue(task)) return false;
      if (term) {
        const haystack = [task.title, task.description, task.assigneeEmail]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [tasks, search, statusFilter, view]);

  // Resolve against the filtered list so a selection the current view no
  // longer includes falls back to what's actually visible
  const selected = selectedId
    ? (filtered.find((task) => task.id === selectedId) ?? null)
    : null;
  const isWide = useIsWideScreen();
  const displayed = selected ?? filtered[0] ?? null;
  const activeId = isWide ? (displayed?.id ?? null) : null;

  const openCount = tasks.filter((task) => isTaskOpen(task.status)).length;
  const heading =
    view === "delegated"
      ? "Delegated"
      : view === "overdue"
        ? "Overdue"
        : statusFilter
          ? TASK_STATUS_LABELS[statusFilter]
          : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-4 pb-3 pt-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <h1 className="font-display text-2xl leading-7 tracking-tight lg:text-3xl">
              Tasks
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {data ? (
                heading ? (
                  <>
                    Showing <span className="text-foreground">{heading}</span> ·{" "}
                    {filtered.length}
                  </>
                ) : (
                  <>
                    {openCount} open · {tasks.length} total
                  </>
                )
              ) : (
                "Track what needs doing — and let the AI chase assignees for updates."
              )}
            </p>
          </div>
          <SearchBar
            onSearch={setSearch}
            placeholder="Search tasks, assignees..."
            className="w-full min-w-0 flex-1 sm:w-auto sm:max-w-md"
          />
          <div className="ml-auto">
            <Button size="sm" onClick={() => setAdding(true)}>
              <PlusIcon className="mr-1.5 size-4" />
              Add task
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto p-4">
          <LoadingContent loading={isLoading && !data} error={error}>
            {data &&
              (filtered.length ? (
                <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {filtered.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      active={task.id === activeId}
                      onSelect={() => setSelectedId(task.id)}
                    />
                  ))}
                </div>
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  {search || heading
                    ? "No tasks match this view."
                    : "No tasks yet. Add one to get started."}
                </p>
              ))}
          </LoadingContent>
        </div>

        <aside className="hidden w-[420px] shrink-0 overflow-y-auto border-l border-border p-5 xl:block">
          {isWide && displayed ? (
            // Re-key on updatedAt so a save (which the server may adjust,
            // e.g. disarming follow-up on completion) remounts the form with
            // fresh values instead of keeping stale mount-time state
            <TaskDetail
              key={`${displayed.id}:${displayed.updatedAt}`}
              task={displayed}
              mutate={mutate}
            />
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Select a task to see its details.
            </p>
          )}
        </aside>
      </div>

      {/* Narrow screens: the detail opens as a full-screen sheet-like overlay */}
      {!isWide && selected && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-background p-5">
          <div className="mx-auto max-w-xl">
            <Button
              variant="ghost"
              size="sm"
              className="mb-4"
              onClick={() => setSelectedId(null)}
            >
              ← Back
            </Button>
            <TaskDetail
              key={`${selected.id}:${selected.updatedAt}`}
              task={selected}
              mutate={mutate}
              onDeleted={() => setSelectedId(null)}
            />
          </div>
        </div>
      )}

      <AddTaskDialog
        open={adding}
        onClose={() => setAdding(false)}
        mutate={mutate}
      />
    </div>
  );
}

function TaskRow({
  task,
  active,
  onSelect,
}: {
  task: TaskListItem;
  active: boolean;
  onSelect: () => void;
}) {
  const overdue = isTaskOverdue(task);
  const open = isTaskOpen(task.status);

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-3 bg-background px-3 py-2.5 text-left hover:bg-muted/50",
        active && "bg-muted/50",
      )}
      onClick={onSelect}
    >
      <StatusDot status={task.status} />
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate text-sm font-medium",
            !open && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {[
            task.assigneeEmail ? `→ ${task.assigneeEmail}` : "Mine",
            task.followUpEnabled ? "Follow-up on" : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {task.priority === "URGENT" && <Badge color="red">Urgent</Badge>}
        {task.priority === "HIGH" && <Badge color="yellow">High</Badge>}
        {task.dueAt && (
          <span
            className={cn(
              "text-xs tabular-nums",
              overdue ? "text-red-500" : "text-muted-foreground",
            )}
          >
            {formatDistanceToNow(new Date(task.dueAt), { addSuffix: true })}
          </span>
        )}
      </div>
    </button>
  );
}

function StatusDot({ status }: { status: TaskStatus }) {
  const color =
    status === "DONE"
      ? "bg-green-500"
      : status === "CANCELLED"
        ? "bg-muted-foreground"
        : status === "BLOCKED"
          ? "bg-red-500"
          : status === "IN_PROGRESS"
            ? "bg-blue-500"
            : "bg-primary";
  return <span className={cn("size-2.5 shrink-0 rounded-full", color)} />;
}
