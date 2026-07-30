"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useAction } from "next-safe-action/hooks";
import debounce from "lodash/debounce";
import {
  ChevronRightIcon,
  CornerUpLeftIcon,
  Link2Icon,
  PaperclipIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import type { TasksResponse } from "@/app/api/tasks/route";
import type { MessagesResponse } from "@/app/api/messages/route";
import type { ContactsResponse } from "@/app/api/contacts/route";
import type { UpdateTaskBody } from "@/utils/actions/task.validation";
import {
  formatAttachmentSize,
  formatRelativeShort,
  isTaskOpen,
  isTaskOverdue,
  TASK_PRIORITY_BADGE_CLASS,
  TASK_PRIORITY_CHIP_ACTIVE_CLASS,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_ORDER,
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
  TASK_STATUS_STYLES,
  taskEmailAttachments,
} from "@/utils/tasks";
import {
  addTaskNoteAction,
  createTaskAction,
  deleteTaskAction,
  linkTaskEmailAction,
  refreshTaskOverviewAction,
  unlinkTaskEmailAction,
  updateTaskAction,
} from "@/utils/actions/task";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getActionErrorMessage } from "@/utils/error";
import { extractNameFromEmail } from "@/utils/email";
import { prefixPath } from "@/utils/path";
import { cn } from "@/utils";
import { toastError, toastSuccess } from "@/components/Toast";
import { SenderAvatar } from "@/components/email-list/SenderAvatar";
import { AttachmentDownloadButton } from "@/components/email-list/AttachmentDownloadButton";
import { LogoMark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { AssigneeAutocomplete } from "./AssigneeAutocomplete";
import { toDatetimeLocal } from "./datetime";

type TaskItem = TasksResponse["tasks"][number];

type DrawerTab = "details" | "assignee" | "ai" | "emails" | "attachments";

const EMAIL_LIKE = /^\S+@\S+\.\S+$/;

// The task drawer from the design: a right slide-over with Details /
// Assignee / AI / Emails tabs. Everything saves automatically.
export function TaskDrawer({
  task,
  tasks,
  mutate,
  onClose,
  onOpenTask,
}: {
  task: TaskItem;
  tasks: TaskItem[];
  mutate: () => void;
  onClose: () => void;
  onOpenTask: (id: string) => void;
}) {
  const { emailAccountId } = useAccount();
  const [tab, setTab] = useState<DrawerTab>("details");

  // Local mirrors for typed fields so saves don't clobber in-flight edits;
  // the drawer remounts per task (keyed on id) so these start fresh
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [assignee, setAssignee] = useState(task.assigneeEmail ?? "");
  const [due, setDue] = useState(toDatetimeLocal(task.dueAt));
  const [cadence, setCadence] = useState(task.followUpCadenceDays);
  const [note, setNote] = useState("");
  const [subDraft, setSubDraft] = useState("");

  const update = useAction(updateTaskAction.bind(null, emailAccountId), {
    onSuccess: () => mutate(),
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });
  const executeUpdate = useRef(update.execute);
  executeUpdate.current = update.execute;

  const debouncedSave = useMemo(
    () =>
      debounce(
        (patch: Partial<Omit<UpdateTaskBody, "id">>) =>
          executeUpdate.current({ id: task.id, ...patch }),
        600,
      ),
    [task.id],
  );
  useEffect(() => () => debouncedSave.flush(), [debouncedSave]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const del = useAction(deleteTaskAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Task deleted" });
      mutate();
      onClose();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  const addNote = useAction(addTaskNoteAction.bind(null, emailAccountId), {
    onSuccess: () => {
      setNote("");
      mutate();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  const addSubtask = useAction(createTaskAction.bind(null, emailAccountId), {
    onSuccess: () => {
      setSubDraft("");
      mutate();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  const removeSubtask = useAction(deleteTaskAction.bind(null, emailAccountId), {
    onSuccess: () => mutate(),
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  const open = isTaskOpen(task.status);
  const overdue = isTaskOverdue(task);
  const parent = task.parentId
    ? tasks.find((candidate) => candidate.id === task.parentId)
    : undefined;
  const subtasks = tasks.filter((candidate) => candidate.parentId === task.id);
  const emails = task.emails ?? [];
  const canFollowUp = !!assignee.trim();

  const saveAssignee = (value: string) => {
    setAssignee(value);
    const trimmed = value.trim();
    // Partial typing isn't a valid assignee yet; save real emails or a clear
    if (!trimmed || EMAIL_LIKE.test(trimmed)) {
      debouncedSave({ assigneeEmail: trimmed });
    } else {
      debouncedSave.cancel();
    }
  };

  const attachmentCount = emails.reduce(
    (count, email) => count + taskEmailAttachments(email).length,
    0,
  );
  const tabs: { key: DrawerTab; name: string }[] = [
    { key: "details", name: "Details" },
    { key: "assignee", name: "Assignee" },
    { key: "ai", name: "AI" },
    {
      key: "emails",
      name: emails.length ? `Emails (${emails.length})` : "Emails",
    },
    {
      key: "attachments",
      name: attachmentCount
        ? `Attachments (${attachmentCount})`
        : "Attachments",
    },
  ];

  return (
    <>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes via the document listener above */}
      <div className="fixed inset-0 z-40 bg-black/55" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-[min(560px,100vw)] flex-col border-l border-border bg-background shadow-2xl duration-200 animate-in slide-in-from-right">
        <div className="flex shrink-0 items-start gap-3 border-b border-border px-6 pb-3.5 pt-[calc(1.25rem+env(safe-area-inset-top,0px))]">
          <span
            title={TASK_STATUS_LABELS[task.status]}
            className={cn(
              "mt-2.5 size-3 shrink-0 rounded-full",
              TASK_STATUS_STYLES[task.status].dot,
            )}
          />
          <div className="min-w-0 flex-1">
            {parent && (
              <button
                type="button"
                className="mb-0.5 inline-flex max-w-full items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onOpenTask(parent.id)}
              >
                <CornerUpLeftIcon className="size-3 shrink-0" />
                <span className="min-w-0 truncate">
                  Part of: {parent.title}
                </span>
              </button>
            )}
            <h2 className="min-w-0 break-words font-display text-[23px] leading-tight tracking-tight">
              {title || task.title}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground">
              <span className="break-all">
                {task.assigneeEmail
                  ? `Assigned to ${task.assigneeEmail}`
                  : "Yours"}
              </span>
              {task.dueAt && (
                <span
                  className={
                    overdue ? "text-red-500 dark:text-red-400" : undefined
                  }
                >
                  Due {formatRelativeShort(task.dueAt)}
                </span>
              )}
              {overdue && <OverdueBadge />}
            </div>
          </div>
          <Button
            variant="outline"
            size="iconSm"
            className="shrink-0 border-red-900/50 text-red-500 hover:bg-red-950/40 hover:text-red-400 dark:text-red-400"
            loading={del.isExecuting}
            onClick={() => {
              if (confirm("Delete this task (and its subtasks)?")) {
                del.execute({ id: task.id });
              }
            }}
          >
            <span className="sr-only">Delete task</span>
            <Trash2Icon className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="iconSm"
            className="shrink-0"
            onClick={onClose}
          >
            <span className="sr-only">Close</span>
            <XIcon className="size-4" />
          </Button>
        </div>

        <div className="flex shrink-0 gap-5 overflow-x-auto border-b border-border px-6 text-[13.5px] font-medium">
          {tabs.map(({ key, name }) => (
            <button
              key={key}
              type="button"
              className={cn(
                "whitespace-nowrap border-b-2 px-0.5 py-2.5",
                tab === key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setTab(key)}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-4">
          {tab === "details" && (
            <>
              <div>
                <div className="mb-2 text-[13px] font-medium">Status</div>
                <div className="flex flex-wrap gap-1.5">
                  {TASK_STATUS_ORDER.map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={cn(
                        "inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[12.5px] font-medium",
                        task.status === status
                          ? cn(
                              TASK_STATUS_STYLES[status].activeBorder,
                              "bg-foreground/5 text-foreground",
                            )
                          : "border-border text-muted-foreground hover:border-muted-foreground/40",
                      )}
                      onClick={() => update.execute({ id: task.id, status })}
                    >
                      <span
                        className={cn(
                          "size-[7px] rounded-full",
                          TASK_STATUS_STYLES[status].dot,
                        )}
                      />
                      {TASK_STATUS_LABELS[status]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-[13px] font-medium">Priority</div>
                <div className="flex flex-wrap gap-1.5">
                  {TASK_PRIORITY_ORDER.map((priority) => (
                    <button
                      key={priority}
                      type="button"
                      className={cn(
                        "inline-flex h-[30px] items-center whitespace-nowrap rounded-full border px-3 text-[12.5px] font-medium",
                        task.priority === priority
                          ? TASK_PRIORITY_CHIP_ACTIVE_CLASS[priority]
                          : "border-border text-muted-foreground hover:border-muted-foreground/40",
                      )}
                      onClick={() => update.execute({ id: task.id, priority })}
                    >
                      {TASK_PRIORITY_LABELS[priority]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  className="mb-2 block text-[13px] font-medium"
                  htmlFor="drawer-task-title"
                >
                  Title
                </label>
                <Input
                  id="drawer-task-title"
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    if (event.target.value.trim()) {
                      debouncedSave({ title: event.target.value });
                    }
                  }}
                />
              </div>

              <div>
                <label
                  className="mb-2 block text-[13px] font-medium"
                  htmlFor="drawer-task-description"
                >
                  Description
                </label>
                <Textarea
                  id="drawer-task-description"
                  rows={3}
                  placeholder="Add context for you and the AI…"
                  value={description}
                  onChange={(event) => {
                    setDescription(event.target.value);
                    debouncedSave({ description: event.target.value });
                  }}
                />
              </div>

              {/* Subtasks — only top-level tasks nest */}
              {!task.parentId && (
                <div>
                  <div className="mb-2 flex items-baseline gap-2">
                    <div className="text-[13px] font-medium">Subtasks</div>
                    {subtasks.length > 0 && (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {subtasks.filter((s) => s.status === "DONE").length} of{" "}
                        {subtasks.length} done
                      </span>
                    )}
                  </div>
                  {subtasks.length > 0 && (
                    <RocketProgress
                      percent={Math.round(
                        (100 *
                          subtasks.filter((s) => s.status === "DONE").length) /
                          subtasks.length,
                      )}
                    />
                  )}
                  <div className="flex flex-col gap-0.5">
                    {subtasks.map((subtask) => (
                      <SubtaskRow
                        key={subtask.id}
                        subtask={subtask}
                        onToggle={() =>
                          update.execute({
                            id: subtask.id,
                            status: subtask.status === "DONE" ? "TODO" : "DONE",
                          })
                        }
                        onOpen={() => onOpenTask(subtask.id)}
                        onRemove={() =>
                          removeSubtask.execute({ id: subtask.id })
                        }
                      />
                    ))}
                  </div>
                  <div className="mt-1.5 flex gap-2">
                    <Input
                      className="h-[34px] flex-1 text-[13px]"
                      placeholder="Add a subtask…"
                      value={subDraft}
                      onChange={(event) => setSubDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" &&
                          subDraft.trim() &&
                          !addSubtask.isExecuting
                        ) {
                          addSubtask.execute({
                            title: subDraft,
                            parentId: task.id,
                          });
                        }
                      }}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-[34px] shrink-0"
                      loading={addSubtask.isExecuting}
                      disabled={!subDraft.trim()}
                      onClick={() =>
                        addSubtask.execute({
                          title: subDraft,
                          parentId: task.id,
                        })
                      }
                    >
                      <span className="sr-only">Add subtask</span>
                      <PlusIcon className="size-4" />
                    </Button>
                  </div>
                </div>
              )}

              <div>
                <label
                  className="mb-2 block text-[13px] font-medium"
                  htmlFor="drawer-task-due"
                >
                  Due
                </label>
                <Input
                  id="drawer-task-due"
                  type="datetime-local"
                  value={due}
                  onChange={(event) => {
                    setDue(event.target.value);
                    executeUpdate.current({
                      id: task.id,
                      dueAt: event.target.value
                        ? new Date(event.target.value).toISOString()
                        : null,
                    });
                  }}
                />
              </div>

              <div>
                <h3 className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                  Activity
                </h3>
                <div className="flex gap-2">
                  <Input
                    value={note}
                    placeholder="Add a note…"
                    onChange={(event) => setNote(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        note.trim() &&
                        !addNote.isExecuting
                      ) {
                        addNote.execute({ taskId: task.id, content: note });
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    loading={addNote.isExecuting}
                    disabled={!note.trim()}
                    onClick={() =>
                      addNote.execute({ taskId: task.id, content: note })
                    }
                  >
                    Add
                  </Button>
                </div>
                <div className="mt-3 flex flex-col gap-2.5">
                  {(task.activity ?? []).map((entry) => (
                    <div key={entry.id} className="flex gap-2.5 text-[13px]">
                      <span
                        className={cn(
                          "mt-[7px] size-1.5 shrink-0 rounded-full",
                          entry.type === "FOLLOW_UP_SENT" ||
                            entry.type === "REPLY_DETECTED" ||
                            entry.type === "AI_UPDATE"
                            ? "bg-primary"
                            : "bg-muted-foreground/50",
                        )}
                      />
                      <div className="min-w-0">
                        <p className="leading-snug text-foreground/85">
                          {entry.content}
                        </p>
                        <p className="mt-px text-xs text-muted-foreground">
                          {formatRelativeShort(entry.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {!task.activity?.length && (
                    <p className="text-[13px] text-muted-foreground">
                      No activity yet.
                    </p>
                  )}
                </div>
              </div>

              <p className="text-[11.5px] text-muted-foreground/60">
                Changes save automatically.
              </p>
            </>
          )}

          {tab === "assignee" && (
            <AssigneeTab
              task={task}
              assignee={assignee}
              onChangeAssignee={saveAssignee}
              onPickAssignee={(email) => {
                setAssignee(email);
                debouncedSave.cancel();
                executeUpdate.current({ id: task.id, assigneeEmail: email });
              }}
            />
          )}

          {tab === "ai" && (
            <AiTab
              task={task}
              canFollowUp={canFollowUp}
              cadence={cadence}
              onChangeCadence={(value) => {
                setCadence(value);
                debouncedSave({ followUpCadenceDays: value });
              }}
              onToggleFollowUp={() => {
                if (!canFollowUp) return;
                update.execute({
                  id: task.id,
                  followUpEnabled: !task.followUpEnabled,
                });
              }}
              mutate={mutate}
            />
          )}

          {tab === "emails" && (
            <EmailsTab task={task} open={open} mutate={mutate} />
          )}

          {tab === "attachments" && <AttachmentsTab task={task} />}
        </div>
      </div>
    </>
  );
}

function OverdueBadge() {
  return (
    <span className="inline-flex items-center rounded-md bg-red-400/10 px-2 py-0.5 text-[11px] font-medium text-red-500 ring-1 ring-inset ring-red-400/20 dark:text-red-400">
      Overdue
    </span>
  );
}

// The subtask progress bar: an exhaust-trail gradient with the Zerrow
// rocket riding its leading edge
function RocketProgress({ percent }: { percent: number }) {
  const width = `${percent}%`;
  return (
    <div className="relative mb-2 h-[18px]">
      <div className="absolute inset-x-0 top-[7px] h-1 overflow-hidden rounded-sm bg-border">
        <div
          className="h-full rounded-sm transition-[width] duration-200 animate-[task-rocket-exhaust_1.1s_ease-in-out_infinite]"
          style={{
            width,
            background:
              "linear-gradient(90deg, rgba(139,147,167,0) 0%, rgba(139,147,167,0.35) 18%, rgba(139,147,167,0.55) 42%, #B43310 68%, #F14E23 84%, #FFB35C 94%, #FFE28A 100%)",
          }}
        />
      </div>
      <span
        className="pointer-events-none absolute top-[9px] h-2.5 w-3.5 rounded-full blur-[1.5px] transition-[left] duration-200 animate-[task-rocket-glow_0.9s_ease-in-out_infinite]"
        style={{
          left: width,
          background:
            "radial-gradient(closest-side, rgba(255,214,120,0.9), rgba(241,78,35,0.55) 55%, rgba(241,78,35,0) 100%)",
        }}
      />
      <span
        className="absolute top-0 -translate-x-1/2 leading-none transition-[left] duration-200"
        style={{ left: width }}
      >
        <LogoMark className="h-[18px] rotate-90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]" />
      </span>
    </div>
  );
}

function SubtaskRow({
  subtask,
  onToggle,
  onOpen,
  onRemove,
}: {
  subtask: TasksResponse["tasks"][number];
  onToggle: () => void;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const done = subtask.status === "DONE";
  const subtaskOverdue = isTaskOverdue(subtask);
  const meta = [
    subtask.assigneeEmail ? `→ ${subtask.assigneeEmail.split("@")[0]}` : null,
    subtask.dueAt && !done ? formatRelativeShort(subtask.dueAt) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const showPriority =
    (subtask.priority === "HIGH" || subtask.priority === "URGENT") && !done;

  return (
    <div className="group flex items-center gap-2.5 rounded-md px-1.5 py-1 hover:bg-muted/40">
      <button
        type="button"
        aria-label={done ? "Reopen subtask" : "Mark subtask done"}
        className={cn(
          "flex size-[17px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px]",
          done ? "border-primary bg-primary" : "border-border",
        )}
        onClick={onToggle}
      >
        {done && <CheckMark className="size-2.5 text-white" />}
      </button>
      <button
        type="button"
        className={cn(
          "min-w-0 flex-1 truncate text-left text-[13.5px] hover:underline",
          done && "text-muted-foreground line-through",
        )}
        onClick={onOpen}
      >
        {subtask.title}
      </button>
      {showPriority && (
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-medium ring-1 ring-inset",
            TASK_PRIORITY_BADGE_CLASS[subtask.priority],
          )}
        >
          {TASK_PRIORITY_LABELS[subtask.priority]}
        </span>
      )}
      {meta && (
        <span
          className={cn(
            "shrink-0 whitespace-nowrap text-[11.5px]",
            subtaskOverdue
              ? "text-red-500 dark:text-red-400"
              : "text-muted-foreground",
          )}
        >
          {meta}
        </span>
      )}
      <button
        type="button"
        aria-label="Open subtask"
        className="flex size-[22px] shrink-0 items-center justify-center rounded-[5px] text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={onOpen}
      >
        <ChevronRightIcon className="size-3" />
      </button>
      <button
        type="button"
        aria-label="Delete subtask"
        className="flex size-[22px] shrink-0 items-center justify-center rounded-[5px] text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={onRemove}
      >
        <XIcon className="size-3" />
      </button>
    </div>
  );
}

function AssigneeTab({
  task,
  assignee,
  onChangeAssignee,
  onPickAssignee,
}: {
  task: TaskItem;
  assignee: string;
  onChangeAssignee: (value: string) => void;
  onPickAssignee: (email: string) => void;
}) {
  const { emailAccountId } = useAccount();
  const { data } = useSWR<ContactsResponse>(
    "/api/contacts?limit=500&sort=name",
    { revalidateOnFocus: false },
  );

  const saved = task.assigneeEmail?.trim().toLowerCase();
  const match = saved
    ? data?.contacts.find((contact) => contact.email?.toLowerCase() === saved)
    : undefined;

  return (
    <>
      <p className="text-[12.5px] text-muted-foreground">
        Who owns this task. Delegated tasks can get automatic AI follow-ups —
        set that up in the AI tab.
      </p>
      <div>
        <label
          className="mb-2 block text-[13px] font-medium"
          htmlFor="drawer-task-assignee"
        >
          Assignee
        </label>
        <AssigneeAutocomplete
          id="drawer-task-assignee"
          value={assignee}
          onChange={onChangeAssignee}
          onPick={onPickAssignee}
        />
      </div>
      {match?.email && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3.5">
          <SenderAvatar
            name={match.name || match.email}
            className="size-10 text-[13px]"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">
              {match.name || match.email}
            </div>
            <div className="truncate text-[12.5px] text-muted-foreground">
              {match.email}
            </div>
          </div>
          <Button variant="outline" size="sm" className="shrink-0" asChild>
            <Link href={prefixPath(emailAccountId, "/contacts")}>
              Open in Contacts
            </Link>
          </Button>
        </div>
      )}
      {saved && data && !match && (
        <p className="text-[12.5px] text-muted-foreground">
          {task.assigneeEmail} isn't in your contacts yet — follow-ups still
          work by email.
        </p>
      )}
      {!saved && (
        <div className="rounded-lg border border-border bg-card p-3.5">
          <div className="text-[13px] font-medium">This task is yours.</div>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Pick a contact above to delegate it.
          </p>
        </div>
      )}
    </>
  );
}

function AiTab({
  task,
  canFollowUp,
  cadence,
  onChangeCadence,
  onToggleFollowUp,
  mutate,
}: {
  task: TaskItem;
  canFollowUp: boolean;
  cadence: number;
  onChangeCadence: (value: number) => void;
  onToggleFollowUp: () => void;
  mutate: () => void;
}) {
  const { emailAccountId } = useAccount();
  const refresh = useAction(
    refreshTaskOverviewAction.bind(null, emailAccountId),
    {
      onSuccess: () => mutate(),
      onError: (error) => {
        toastError({ description: getActionErrorMessage(error.error) });
      },
    },
  );

  return (
    <>
      {task.aiStatusSummary ? (
        <div className="rounded-lg border border-border bg-card p-3.5">
          <AiCardHeading />
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            {task.aiStatusSummary}
          </p>
          <p className="mt-2.5 text-[11.5px] text-muted-foreground/60">
            Built from linked emails and assignee replies — see the Emails tab.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-muted-foreground/25 p-4 text-center">
          <p className="text-[13px] text-muted-foreground">
            No AI overview yet. Link emails to this task or turn on follow-up
            below and the AI will keep a running status here.
          </p>
        </div>
      )}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        loading={refresh.isExecuting}
        onClick={() => refresh.execute({ id: task.id })}
      >
        <SparklesIcon className="mr-1.5 size-3.5 text-primary" />
        Refresh overview
      </Button>
      <div className="rounded-lg border border-border bg-card p-3.5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[13px] font-medium">AI follow-up</div>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              The AI emails the assignee for updates and reads their replies
              into this task.
            </p>
          </div>
          <Switch
            checked={task.followUpEnabled}
            disabled={!canFollowUp}
            className={cn(!canFollowUp && "opacity-40")}
            onCheckedChange={onToggleFollowUp}
          />
        </div>
        {task.followUpEnabled && (
          <div className="mt-3 flex items-center gap-2.5">
            <span className="text-[12.5px] text-muted-foreground">Every</span>
            <Input
              type="number"
              min={1}
              max={90}
              className="h-8 w-16"
              value={cadence}
              onChange={(event) => {
                const value = Math.max(
                  1,
                  Math.min(90, Number(event.target.value) || 1),
                );
                onChangeCadence(value);
              }}
            />
            <span className="text-[12.5px] text-muted-foreground">days</span>
          </div>
        )}
        {task.followUpEnabled && task.nextFollowUpAt && (
          <p className="mt-2 text-xs text-muted-foreground">
            Next follow-up {formatRelativeShort(task.nextFollowUpAt)} ·{" "}
            {task.followUpCount} sent
          </p>
        )}
        {!canFollowUp && (
          <p className="mt-2.5 text-xs text-muted-foreground">
            Add an assignee in the Assignee tab to enable follow-up.
          </p>
        )}
      </div>
    </>
  );
}

function EmailsTab({
  task,
  open,
  mutate,
}: {
  task: TaskItem;
  open: boolean;
  mutate: () => void;
}) {
  const { emailAccountId } = useAccount();
  const [pickerOpen, setPickerOpen] = useState(false);
  const emails = task.emails ?? [];

  const { data: recent, isLoading } = useSWR<MessagesResponse>(
    pickerOpen ? "/api/messages" : null,
    { revalidateOnFocus: false },
  );

  const link = useAction(linkTaskEmailAction.bind(null, emailAccountId), {
    onSuccess: () => {
      setPickerOpen(false);
      mutate();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  const unlink = useAction(unlinkTaskEmailAction.bind(null, emailAccountId), {
    onSuccess: () => mutate(),
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  const linkedMessageIds = new Set(emails.map((email) => email.messageId));
  const pickable = (recent?.messages ?? []).filter(
    (message) => !linkedMessageIds.has(message.id),
  );

  return (
    <>
      <p className="text-[12.5px] text-muted-foreground">
        The AI reads these emails to keep this task's status current.
      </p>
      {task.aiStatusSummary && (
        <div className="rounded-lg border border-border bg-card p-3.5">
          <AiCardHeading />
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            {task.aiStatusSummary}
          </p>
        </div>
      )}
      {emails.map((email) => (
        <div
          key={email.id}
          className="flex gap-2.5 rounded-lg border border-border bg-card px-3.5 py-3"
        >
          <SenderAvatar name={email.from} className="size-[30px]" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                {email.from}
              </span>
              {taskEmailAttachments(email).length > 0 && (
                <span
                  title="Has attachments — see the Attachments tab"
                  className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground"
                >
                  <PaperclipIcon className="size-3" />
                  {taskEmailAttachments(email).length}
                </span>
              )}
              {email.receivedAt && (
                <span className="shrink-0 whitespace-nowrap text-[11.5px] text-muted-foreground">
                  {formatRelativeShort(email.receivedAt)}
                </span>
              )}
            </div>
            <div className="truncate text-[13px] font-medium text-foreground/85">
              {email.subject}
            </div>
            {email.snippet && (
              <div className="truncate text-[12.5px] text-muted-foreground">
                {email.snippet}
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label="Unlink email"
            className="flex size-6 shrink-0 items-center justify-center self-start rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => unlink.execute({ id: email.id })}
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      ))}
      {!emails.length && (
        <p className="py-4 text-center text-[13px] text-muted-foreground">
          No emails linked yet. You can also right-click any email in Mail and
          choose "Add to task".
        </p>
      )}
      {open && !pickerOpen && (
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 self-start rounded-lg border border-dashed border-muted-foreground/40 px-3 text-[12.5px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          onClick={() => setPickerOpen(true)}
        >
          <Link2Icon className="size-3.5" />
          Link an email
        </button>
      )}
      {pickerOpen && (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border/70 px-3.5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
            Recent mail
          </div>
          {isLoading && (
            <p className="px-3.5 py-3 text-[12.5px] text-muted-foreground">
              Loading recent mail…
            </p>
          )}
          {pickable.map((message) => (
            <button
              key={message.id}
              type="button"
              className="flex w-full items-baseline gap-2 border-t border-border/70 px-3.5 py-2 text-left hover:bg-muted/40"
              disabled={link.isExecuting}
              onClick={() => {
                const receivedAt = message.headers.date
                  ? new Date(message.headers.date)
                  : null;
                link.execute({
                  taskId: task.id,
                  threadId: message.threadId,
                  messageId: message.id,
                  from: extractNameFromEmail(message.headers.from),
                  subject: message.headers.subject ?? "",
                  snippet: message.snippet,
                  receivedAt:
                    receivedAt && !Number.isNaN(receivedAt.getTime())
                      ? receivedAt.toISOString()
                      : null,
                });
              }}
            >
              <span className="max-w-[130px] shrink-0 truncate text-[12.5px] font-semibold">
                {extractNameFromEmail(message.headers.from)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground/85">
                {message.headers.subject}
              </span>
              {message.headers.date && (
                <span className="shrink-0 text-[11.5px] text-muted-foreground">
                  {formatRelativeShort(message.headers.date)}
                </span>
              )}
            </button>
          ))}
          {recent && !pickable.length && (
            <p className="border-t border-border/70 px-3.5 py-3 text-[12.5px] text-muted-foreground">
              Nothing new to link.
            </p>
          )}
        </div>
      )}
    </>
  );
}

// Attachments across every linked email, downloadable via the same
// endpoint the mail view uses
function AttachmentsTab({ task }: { task: TaskItem }) {
  const rows = (task.emails ?? []).flatMap((email) =>
    taskEmailAttachments(email).map((attachment) => ({ email, attachment })),
  );

  return (
    <>
      <p className="text-[12.5px] text-muted-foreground">
        Files attached to this task's linked emails — including assignee replies
        the AI reads in.
      </p>
      {rows.map(({ email, attachment }) => {
        const searchParams = new URLSearchParams({
          messageId: email.messageId,
          attachmentId: attachment.attachmentId,
          mimeType: attachment.mimeType,
          filename: attachment.filename,
        });
        return (
          <div
            key={`${email.messageId}:${attachment.attachmentId}`}
            className="flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3"
          >
            <PaperclipIcon className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">
                {attachment.filename}
              </div>
              <div className="truncate text-[11.5px] text-muted-foreground">
                {[
                  formatAttachmentSize(attachment.size),
                  email.from,
                  email.receivedAt
                    ? formatRelativeShort(email.receivedAt)
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            <AttachmentDownloadButton
              url={`/api/messages/attachment?${searchParams.toString()}`}
              filename={attachment.filename}
            />
          </div>
        );
      })}
      {!rows.length && (
        <p className="py-4 text-center text-[13px] text-muted-foreground">
          No attachments yet. Files on emails you link — or that assignees reply
          with — show up here.
        </p>
      )}
    </>
  );
}

function AiCardHeading() {
  return (
    <h3 className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
      <SparklesIcon className="size-3 text-primary" />
      AI status
    </h3>
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
