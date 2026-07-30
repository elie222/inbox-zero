"use client";

import { useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { useAction } from "next-safe-action/hooks";
import {
  CheckCircleIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  KanbanIcon,
  ListIcon,
  MailIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import type { TasksResponse } from "@/app/api/tasks/route";
import {
  formatRelativeShort,
  isTaskOpen,
  isTaskOverdue,
  TASK_DUE_BUCKETS,
  TASK_PRIORITY_BADGE_CLASS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
  TASK_STATUS_STYLES,
  taskDueBucket,
} from "@/utils/tasks";
import type { TaskStatus } from "@/generated/prisma/enums";
import { bulkTasksAction, updateTaskAction } from "@/utils/actions/task";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getActionErrorMessage } from "@/utils/error";
import { prefixPath } from "@/utils/path";
import { cn } from "@/utils";
import { toastError, toastSuccess } from "@/components/Toast";
import { SearchBar } from "@/components/SearchBar";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "@/components/ui/button";
import {
  RowContextMenu,
  type RowMenuItem,
} from "@/components/email-list/RowContextMenu";
import { TaskDrawer } from "./TaskDrawer";
import { AddTaskDialog } from "./AddTaskDialog";

type TaskItem = TasksResponse["tasks"][number];
type ViewKey = "all" | "mine" | "delegated" | "overdue";

// Status-dot click walks TODO → In progress → Blocked → Done and wraps;
// Cancelled is only reachable from the drawer or context menu
const CYCLE_STATUSES = TASK_STATUS_ORDER.slice(0, 4);

export function TasksList() {
  const { emailAccountId } = useAccount();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"list" | "kanban">("list");
  const [groupBy, setGroupBy] = useState<"due" | "status">("due");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  // The sidebar's Add task button lands here as ?add=1
  const [addingState, setAddingState] = useState(false);
  const adding = addingState || searchParams.get("add") === "1";
  const closeAdd = () => {
    setAddingState(false);
    if (searchParams.get("add")) {
      const params = new URLSearchParams(searchParams);
      params.delete("add");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    }
  };
  const [rowMenu, setRowMenu] = useState<{
    x: number;
    y: number;
    id: string;
  } | null>(null);
  const dragId = useRef<string | null>(null);

  const viewParam = searchParams.get("view");
  const view: ViewKey =
    viewParam === "mine" || viewParam === "delegated" || viewParam === "overdue"
      ? viewParam
      : "all";
  const statusFilter = searchParams.get("status") as TaskStatus | null;

  const { data, isLoading, error, mutate } = useSWR<TasksResponse>(
    "/api/tasks",
    { keepPreviousData: true },
  );

  const update = useAction(updateTaskAction.bind(null, emailAccountId), {
    onSuccess: () => mutate(),
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  const bulk = useAction(bulkTasksAction.bind(null, emailAccountId), {
    onSuccess: ({ data: result, input }) => {
      setSelected({});
      mutate();
      const affected = result?.affected ?? 0;
      if (input.op === "nudge") {
        toastSuccess({
          description: affected
            ? `Nudged ${affected} assignee${affected === 1 ? "" : "s"} — next follow-ups moved to now`
            : "Nothing to nudge — selected tasks need an assignee and must be open",
        });
      }
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  const tasks = data?.tasks ?? [];
  const kidsOf = useMemo(() => {
    const map = new Map<string, TaskItem[]>();
    for (const task of tasks) {
      if (!task.parentId) continue;
      map.set(task.parentId, [...(map.get(task.parentId) ?? []), task]);
    }
    return map;
  }, [tasks]);
  const byId = useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks],
  );

  const term = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      tasks.filter((task) => {
        if (statusFilter && task.status !== statusFilter) return false;
        if (view === "mine" && (task.assigneeEmail || !isTaskOpen(task.status)))
          return false;
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
      }),
    [tasks, statusFilter, view, term],
  );

  // The plain "All tasks" view rolls subtasks up into their parent; any
  // filter or search shows them flat so matches aren't hidden
  const isDefault = view === "all" && !statusFilter && !term;
  const listPool = isDefault
    ? filtered.filter((task) => !task.parentId)
    : filtered;

  const openCount = tasks.filter(
    (task) => !task.parentId && isTaskOpen(task.status),
  ).length;
  const overdueCount = tasks.filter((task) => isTaskOverdue(task)).length;

  const heading = statusFilter
    ? TASK_STATUS_LABELS[statusFilter]
    : {
        all: "Tasks",
        mine: "My tasks",
        delegated: "Delegated",
        overdue: "Overdue",
      }[view];

  // Grouped list rows: headers + tasks (+ expanded subtasks)
  const rows = useMemo(() => {
    const result: (
      | { kind: "header"; label: string; count: number; color?: string }
      | { kind: "task"; task: TaskItem; indent: boolean }
    )[] = [];
    const pushWithKids = (task: TaskItem) => {
      result.push({ kind: "task", task, indent: false });
      if (isDefault && expanded[task.id]) {
        for (const kid of kidsOf.get(task.id) ?? []) {
          result.push({ kind: "task", task: kid, indent: true });
        }
      }
    };
    if (groupBy === "due") {
      for (const { key, label } of TASK_DUE_BUCKETS) {
        const group = listPool.filter((task) => taskDueBucket(task) === key);
        if (!group.length) continue;
        result.push({
          kind: "header",
          label,
          count: group.length,
          color:
            key === "overdue" ? "text-red-500 dark:text-red-400" : undefined,
        });
        group.forEach(pushWithKids);
      }
    } else {
      for (const status of TASK_STATUS_ORDER) {
        const group = listPool.filter((task) => task.status === status);
        if (!group.length) continue;
        result.push({
          kind: "header",
          label: TASK_STATUS_LABELS[status],
          count: group.length,
        });
        group.forEach(pushWithKids);
      }
    }
    return result;
  }, [listPool, groupBy, isDefault, expanded, kidsOf]);

  const visibleIds = rows
    .filter((row) => row.kind === "task")
    .map((row) => (row.kind === "task" ? row.task.id : ""));
  const selectedIds = Object.keys(selected).filter((id) => selected[id]);
  const allSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected[id]);

  const countLine = data
    ? `${listPool.length} ${listPool.length === 1 ? "task" : "tasks"} · ${
        listPool.filter((task) => isTaskOpen(task.status)).length
      } open${
        overdueCount && view === "all" && !statusFilter
          ? ` · ${overdueCount} overdue`
          : ""
      }`
    : "";

  const cycleStatus = (task: TaskItem) => {
    const index = CYCLE_STATUSES.indexOf(task.status);
    const next = CYCLE_STATUSES[(index + 1) % CYCLE_STATUSES.length];
    update.execute({ id: task.id, status: next });
  };

  const openTask = (id: string) => setOpenId(id);
  const setView = (next: ViewKey) => {
    setSelected({});
    router.push(
      prefixPath(
        emailAccountId,
        next === "all" ? "/tasks" : `/tasks?view=${next}`,
      ),
    );
  };
  const setStatusView = (status: TaskStatus | null) => {
    setSelected({});
    router.push(
      prefixPath(emailAccountId, status ? `/tasks?status=${status}` : "/tasks"),
    );
  };

  const menuTask = rowMenu ? byId.get(rowMenu.id) : undefined;
  const openTaskItem = openId ? byId.get(openId) : undefined;

  const subLine = (task: TaskItem, indent: boolean) => {
    const parent =
      task.parentId && !indent ? byId.get(task.parentId) : undefined;
    return (
      (parent ? `↳ ${parent.title} · ` : "") +
      (task.assigneeEmail ? `→ ${task.assigneeEmail}` : "Mine")
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Control bar */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-4 py-3 md:px-6 md:py-4">
        <h1 className="shrink-0 font-display text-[22px] leading-tight tracking-tight md:text-[26px]">
          {heading}
        </h1>
        <SearchBar
          onSearch={setSearch}
          placeholder="Search tasks, assignees"
          className="min-w-[180px] max-w-[420px] flex-1"
        />
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="size-[34px]"
            onClick={() => mutate()}
          >
            <span className="sr-only">Refresh</span>
            <RefreshCwIcon className="size-[15px]" />
          </Button>
          <Button size="sm" onClick={() => setAddingState(true)}>
            <PlusIcon className="mr-1.5 size-3.5" />
            Add task
          </Button>
        </div>
      </div>

      {/* Mobile view chips */}
      <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-border px-4 py-2.5 md:hidden">
        <ViewChip
          name="All"
          active={view === "all" && !statusFilter}
          count={openCount}
          onClick={() => setView("all")}
        />
        <ViewChip
          name="Mine"
          active={view === "mine"}
          onClick={() => setView("mine")}
        />
        <ViewChip
          name="Delegated"
          active={view === "delegated"}
          onClick={() => setView("delegated")}
        />
        <ViewChip
          name="Overdue"
          active={view === "overdue"}
          count={overdueCount}
          dotClass="bg-red-400"
          onClick={() => setView("overdue")}
        />
        {TASK_STATUS_ORDER.slice(0, 3).map((status) => (
          <ViewChip
            key={status}
            name={TASK_STATUS_LABELS[status]}
            active={statusFilter === status}
            dotClass={TASK_STATUS_STYLES[status].dot}
            onClick={() =>
              setStatusView(statusFilter === status ? null : status)
            }
          />
        ))}
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto p-4 pb-6 md:px-6">
        {/* Meta row */}
        <div className="mb-3 flex items-center gap-2">
          {mode === "list" && (
            <button
              type="button"
              aria-label={allSelected ? "Clear selection" : "Select all"}
              className={cn(
                "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px]",
                allSelected ? "border-primary bg-primary" : "border-border",
              )}
              onClick={() => {
                const next: Record<string, boolean> = {};
                if (!allSelected) {
                  for (const id of visibleIds) next[id] = true;
                }
                setSelected(next);
              }}
            >
              {allSelected && <CheckMark className="size-2.5 text-white" />}
            </button>
          )}
          <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
            {countLine}
          </span>
          <div className="flex h-[30px] shrink-0 items-center gap-0.5 rounded-lg bg-muted p-0.5">
            <ModeButton
              active={mode === "list"}
              label="List view"
              onClick={() => setMode("list")}
            >
              <ListIcon className="size-3.5" />
            </ModeButton>
            <ModeButton
              active={mode === "kanban"}
              label="Kanban view"
              onClick={() => setMode("kanban")}
            >
              <KanbanIcon className="size-3.5" />
            </ModeButton>
          </div>
          {mode === "list" && (
            <button
              type="button"
              className="inline-flex h-[30px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-2.5 text-[12.5px] text-muted-foreground hover:bg-muted/50"
              onClick={() =>
                setGroupBy((current) => (current === "due" ? "status" : "due"))
              }
            >
              Group by:{" "}
              <span className="font-medium text-foreground">
                {groupBy === "due" ? "Due date" : "Status"}
              </span>
            </button>
          )}
        </div>

        <LoadingContent loading={isLoading && !data} error={error}>
          {data && mode === "kanban" && (
            <div className="flex items-start gap-3 overflow-x-auto pb-2">
              {TASK_STATUS_ORDER.map((status) => {
                const cards = filtered.filter((task) => task.status === status);
                return (
                  <div
                    key={status}
                    className="w-[272px] shrink-0 rounded-xl border border-border/70 bg-muted/20 p-2.5"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (dragId.current) {
                        update.execute({ id: dragId.current, status });
                        dragId.current = null;
                      }
                    }}
                  >
                    <div className="flex items-center gap-2 px-1 pb-2.5 pt-0.5">
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          TASK_STATUS_STYLES[status].dot,
                        )}
                      />
                      <span className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-[0.1em]">
                        {TASK_STATUS_LABELS[status]}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {cards.length}
                      </span>
                    </div>
                    <div className="flex min-h-11 flex-col gap-2">
                      {cards.map((task) => (
                        <KanbanCard
                          key={task.id}
                          task={task}
                          sub={subLine(task, false)}
                          subtasks={kidsOf.get(task.id) ?? []}
                          onDragStart={() => {
                            dragId.current = task.id;
                          }}
                          onOpen={() => openTask(task.id)}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            setRowMenu({
                              x: event.clientX,
                              y: event.clientY,
                              id: task.id,
                            });
                          }}
                        />
                      ))}
                      {!cards.length && (
                        <div className="rounded-lg border border-dashed border-muted-foreground/25 p-3.5 text-center text-xs text-muted-foreground/70">
                          Drop tasks here
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {data && mode === "list" && (
            <div className="flex flex-col gap-2">
              {rows.map((row, index) =>
                row.kind === "header" ? (
                  <div
                    key={`header-${row.label}-${index}`}
                    className="flex items-baseline gap-2 px-0.5 pt-2.5"
                  >
                    <span
                      className={cn(
                        "text-[11px] font-semibold uppercase tracking-[0.14em]",
                        row.color ?? "text-muted-foreground/80",
                      )}
                    >
                      {row.label}
                    </span>
                    <span className="text-[11px] tabular-nums text-muted-foreground/60">
                      {row.count}
                    </span>
                  </div>
                ) : (
                  <TaskRow
                    key={row.task.id}
                    task={row.task}
                    indent={row.indent}
                    sub={subLine(row.task, row.indent)}
                    subtasks={kidsOf.get(row.task.id) ?? []}
                    expandable={
                      isDefault && (kidsOf.get(row.task.id)?.length ?? 0) > 0
                    }
                    expanded={!!expanded[row.task.id]}
                    checked={!!selected[row.task.id]}
                    onToggleExpand={() =>
                      setExpanded((current) => ({
                        ...current,
                        [row.task.id]: !current[row.task.id],
                      }))
                    }
                    onToggleSelect={() =>
                      setSelected((current) => ({
                        ...current,
                        [row.task.id]: !current[row.task.id],
                      }))
                    }
                    onCycleStatus={() => cycleStatus(row.task)}
                    onOpen={() => openTask(row.task.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setRowMenu({
                        x: event.clientX,
                        y: event.clientY,
                        id: row.task.id,
                      });
                    }}
                  />
                ),
              )}
              {!rows.length && (
                <p className="py-12 text-center text-[13.5px] text-muted-foreground">
                  {term || statusFilter || view !== "all"
                    ? "No tasks match this view."
                    : "No tasks yet. Add one to get started."}
                </p>
              )}
            </div>
          )}
        </LoadingContent>
      </div>

      {/* Bulk action bar */}
      {selectedIds.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] z-[60] flex justify-center px-4 max-md:bottom-[calc(var(--mobile-tray-h)+0.75rem)]">
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1 rounded-xl bg-primary px-3 py-2 text-primary-foreground shadow-2xl">
            <span className="px-1.5 text-[13px] font-semibold tabular-nums">
              {selectedIds.length} selected
            </span>
            <BulkButton
              onClick={() => bulk.execute({ ids: selectedIds, op: "done" })}
            >
              <CheckCircleIcon className="size-3.5" />
              Mark done
            </BulkButton>
            <BulkButton
              onClick={() => bulk.execute({ ids: selectedIds, op: "nudge" })}
            >
              <SparklesIcon className="size-3.5" />
              Nudge assignees
            </BulkButton>
            <BulkButton
              onClick={() => {
                if (
                  confirm(
                    `Delete ${selectedIds.length} task${selectedIds.length === 1 ? "" : "s"} (and their subtasks)?`,
                  )
                ) {
                  bulk.execute({ ids: selectedIds, op: "delete" });
                }
              }}
            >
              <Trash2Icon className="size-3.5" />
              Delete
            </BulkButton>
            <button
              type="button"
              aria-label="Clear selection"
              className="flex size-[30px] items-center justify-center rounded-lg hover:bg-white/20"
              onClick={() => setSelected({})}
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Row context menu */}
      {rowMenu && menuTask && (
        <RowContextMenu
          position={rowMenu}
          onClose={() => setRowMenu(null)}
          items={buildTaskMenu(menuTask, {
            onOpen: () => openTask(menuTask.id),
            onStatus: (status) => update.execute({ id: menuTask.id, status }),
            onToggleFollowUp: () =>
              update.execute({
                id: menuTask.id,
                followUpEnabled: !menuTask.followUpEnabled,
              }),
            onDelete: () => {
              if (confirm("Delete this task (and its subtasks)?")) {
                bulk.execute({ ids: [menuTask.id], op: "delete" });
              }
            },
          })}
        />
      )}

      {/* Task drawer — remounts per task so typed fields start fresh */}
      {openTaskItem && (
        <TaskDrawer
          key={openTaskItem.id}
          task={openTaskItem}
          tasks={tasks}
          mutate={mutate}
          onClose={() => setOpenId(null)}
          onOpenTask={(id) => setOpenId(id)}
        />
      )}

      <AddTaskDialog open={adding} onClose={closeAdd} mutate={mutate} />
    </div>
  );
}

function buildTaskMenu(
  task: TaskItem,
  handlers: {
    onOpen: () => void;
    onStatus: (status: TaskStatus) => void;
    onToggleFollowUp: () => void;
    onDelete: () => void;
  },
): RowMenuItem[] {
  const open = isTaskOpen(task.status);
  return [
    { label: "Open", icon: ExternalLinkIcon, onClick: handlers.onOpen },
    open
      ? {
          label: "Mark done",
          icon: CheckCircleIcon,
          onClick: () => handlers.onStatus("DONE"),
        }
      : {
          label: "Reopen",
          icon: RotateCcwIcon,
          onClick: () => handlers.onStatus("TODO"),
        },
    {
      label: "Start progress",
      icon: PlayIcon,
      onClick: () => handlers.onStatus("IN_PROGRESS"),
    },
    { divider: true },
    {
      label: task.followUpEnabled
        ? "Pause AI follow-up"
        : "Enable AI follow-up",
      icon: SparklesIcon,
      onClick: handlers.onToggleFollowUp,
    },
    { divider: true },
    {
      label: "Delete",
      icon: Trash2Icon,
      destructive: true,
      onClick: handlers.onDelete,
    },
  ];
}

function TaskRow({
  task,
  indent,
  sub,
  subtasks,
  expandable,
  expanded,
  checked,
  onToggleExpand,
  onToggleSelect,
  onCycleStatus,
  onOpen,
  onContextMenu,
}: {
  task: TaskItem;
  indent: boolean;
  sub: string;
  subtasks: TaskItem[];
  expandable: boolean;
  expanded: boolean;
  checked: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onCycleStatus: () => void;
  onOpen: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}) {
  const open = isTaskOpen(task.status);
  const overdue = isTaskOverdue(task);
  const doneSubtasks = subtasks.filter((s) => s.status === "DONE").length;
  const allSubtasksDone =
    subtasks.length > 0 && doneSubtasks === subtasks.length;
  const showPriority =
    (task.priority === "HIGH" || task.priority === "URGENT") && open;
  const mailCount = task.emails?.length ?? 0;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the inner Open button is the keyboard path
    <div
      className={cn(
        "relative flex cursor-pointer items-center gap-3 rounded-[10px] border px-3.5 py-2.5 hover:bg-foreground/[0.03]",
        checked ? "border-primary/50 bg-primary/5" : "border-border bg-card",
        indent && "ml-[30px]",
      )}
      onClick={onOpen}
      onContextMenu={onContextMenu}
    >
      <button
        type="button"
        aria-label={checked ? "Deselect task" : "Select task"}
        className={cn(
          "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px]",
          checked ? "border-primary bg-primary" : "border-border",
        )}
        onClick={(event) => {
          event.stopPropagation();
          onToggleSelect();
        }}
      >
        {checked && <CheckMark className="size-2.5 text-white" />}
      </button>
      {expandable && (
        <button
          type="button"
          title="Show subtasks"
          className="-mx-[7px] flex size-[18px] shrink-0 items-center justify-center rounded-[5px] text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation();
            onToggleExpand();
          }}
        >
          <ChevronRightIcon
            className={cn(
              "size-[13px] transition-transform duration-150",
              expanded && "rotate-90",
            )}
          />
        </button>
      )}
      <button
        type="button"
        title={`${TASK_STATUS_LABELS[task.status]} — click to advance`}
        className={cn(
          "size-2.5 shrink-0 rounded-full ring-[3px]",
          TASK_STATUS_STYLES[task.status].dot,
          TASK_STATUS_STYLES[task.status].ring,
        )}
        onClick={(event) => {
          event.stopPropagation();
          onCycleStatus();
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-col gap-px max-md:items-start md:flex-row md:items-baseline md:gap-2">
          <span
            className={cn(
              "min-w-0 truncate text-sm font-semibold",
              !open && "text-muted-foreground line-through",
            )}
          >
            {task.title}
          </span>
          <span className="min-w-0 max-w-full truncate text-[12.5px] text-muted-foreground">
            {sub}
          </span>
        </div>
      </div>
      {subtasks.length > 0 && (
        <span
          title="Subtasks"
          className={cn(
            "hidden shrink-0 items-center gap-1 whitespace-nowrap text-[11.5px] font-medium tabular-nums md:inline-flex",
            allSubtasksDone
              ? "text-green-600 dark:text-green-400"
              : "text-muted-foreground",
          )}
        >
          <SubtaskIcon className="size-3" />
          {doneSubtasks}/{subtasks.length}
        </span>
      )}
      {mailCount > 0 && (
        <span
          title="Linked emails"
          className="hidden shrink-0 items-center gap-1 whitespace-nowrap text-[11.5px] font-medium text-muted-foreground md:inline-flex"
        >
          <MailIcon className="size-3" />
          {mailCount}
        </span>
      )}
      {task.followUpEnabled && open && (
        <span
          title={`AI follow-up every ${task.followUpCadenceDays}d · ${task.followUpCount} sent`}
          className="hidden shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-primary/10 px-2 py-[3px] text-[11px] font-medium text-primary ring-1 ring-inset ring-primary/25 md:inline-flex"
        >
          <SparklesIcon className="size-[11px]" />
          Follow-up
        </span>
      )}
      {showPriority && (
        <span
          className={cn(
            "hidden shrink-0 items-center whitespace-nowrap rounded-md px-2 py-[3px] text-[11px] font-medium ring-1 ring-inset md:inline-flex",
            TASK_PRIORITY_BADGE_CLASS[task.priority],
          )}
        >
          {TASK_PRIORITY_LABELS[task.priority]}
        </span>
      )}
      {task.dueAt && open && (
        <span
          className={cn(
            "shrink-0 whitespace-nowrap text-right text-[12.5px] tabular-nums md:w-16",
            overdue
              ? "text-red-500 dark:text-red-400"
              : "text-muted-foreground",
          )}
        >
          {formatRelativeShort(task.dueAt)}
        </span>
      )}
    </div>
  );
}

function KanbanCard({
  task,
  sub,
  subtasks,
  onDragStart,
  onOpen,
  onContextMenu,
}: {
  task: TaskItem;
  sub: string;
  subtasks: TaskItem[];
  onDragStart: () => void;
  onOpen: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}) {
  const open = isTaskOpen(task.status);
  const overdue = isTaskOverdue(task);
  const doneSubtasks = subtasks.filter((s) => s.status === "DONE").length;
  const allSubtasksDone =
    subtasks.length > 0 && doneSubtasks === subtasks.length;
  const showPriority =
    (task.priority === "HIGH" || task.priority === "URGENT") && open;
  const mailCount = task.emails?.length ?? 0;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the row context menu and drawer cover keyboard flows
    <div
      draggable
      className="cursor-pointer rounded-[10px] border border-border bg-card px-3 py-2.5 hover:border-muted-foreground/30 hover:bg-foreground/[0.03]"
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onClick={onOpen}
      onContextMenu={onContextMenu}
    >
      <div
        className={cn(
          "text-[13.5px] font-semibold leading-snug",
          !open && "text-muted-foreground line-through",
        )}
      >
        {task.title}
      </div>
      <div className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {showPriority && (
          <span
            className={cn(
              "inline-flex items-center rounded-md px-[7px] py-0.5 text-[10.5px] font-medium ring-1 ring-inset",
              TASK_PRIORITY_BADGE_CLASS[task.priority],
            )}
          >
            {TASK_PRIORITY_LABELS[task.priority]}
          </span>
        )}
        {task.followUpEnabled && open && (
          <span title="AI follow-up on" className="inline-flex text-primary">
            <SparklesIcon className="size-3" />
          </span>
        )}
        {subtasks.length > 0 && (
          <span
            title="Subtasks"
            className={cn(
              "inline-flex items-center gap-1 text-[11px] tabular-nums",
              allSubtasksDone
                ? "text-green-600 dark:text-green-400"
                : "text-muted-foreground",
            )}
          >
            <SubtaskIcon className="size-[11px]" />
            {doneSubtasks}/{subtasks.length}
          </span>
        )}
        {mailCount > 0 && (
          <span
            title="Linked emails"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
          >
            <MailIcon className="size-[11px]" />
            {mailCount}
          </span>
        )}
        {task.dueAt && open && (
          <span
            className={cn(
              "ml-auto text-[11.5px] tabular-nums",
              overdue
                ? "text-red-500 dark:text-red-400"
                : "text-muted-foreground",
            )}
          >
            {formatRelativeShort(task.dueAt)}
          </span>
        )}
      </div>
    </div>
  );
}

function ViewChip({
  name,
  active,
  count,
  dotClass,
  onClick,
}: {
  name: string;
  active: boolean;
  count?: number;
  dotClass?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-[30px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-medium",
        active
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-border text-foreground/80",
      )}
      onClick={onClick}
    >
      {dotClass && <span className={cn("size-[7px] rounded-full", dotClass)} />}
      {name}
      {!!count && (
        <span className="text-[11px] font-semibold tabular-nums text-primary">
          {count}
        </span>
      )}
    </button>
  );
}

function ModeButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      className={cn(
        "flex h-[26px] w-[30px] items-center justify-center rounded-md",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
      onClick={onClick}
    >
      <span className="sr-only">{label}</span>
      {children}
    </button>
  );
}

function BulkButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="inline-flex h-[30px] items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium hover:bg-white/20"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function CheckMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function SubtaskIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m3 17 2 2 4-4" />
      <path d="m3 7 2 2 4-4" />
      <path d="M13 6h8" />
      <path d="M13 12h8" />
      <path d="M13 18h8" />
    </svg>
  );
}
