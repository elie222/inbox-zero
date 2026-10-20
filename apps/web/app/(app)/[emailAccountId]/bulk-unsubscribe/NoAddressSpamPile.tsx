"use client";

import { useState } from "react";
import useSWR from "swr";
import chunk from "lodash/chunk";
import { ArchiveIcon, MoreHorizontalIcon, ShieldAlertIcon } from "lucide-react";
import type { NoAddressPileResponse } from "@/app/api/user/stats/no-address-pile/route";
import { ButtonCheckbox } from "@/components/ButtonCheckbox";
import { ButtonLoader } from "@/components/Loading";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError, toastSuccess, toastUndo } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { bulkArchiveThreadsAction } from "@/utils/actions/mail-bulk-action";
import { BULK_ARCHIVE_THREADS_ACTION_LIMIT } from "@/utils/actions/mail-bulk-action.constants";
import {
  moveThreadsToJunkAction,
  restoreThreadsToInboxAction,
} from "@/utils/actions/no-address-spam";
import { MOVE_THREADS_ACTION_LIMIT } from "@/utils/actions/no-address-spam.validation";
import { assertActionSucceeded, captureException } from "@/utils/error";
import { cn } from "@/utils";

type Mode = "junk" | "archive";
type PileName = NoAddressPileResponse["names"][number];

/** Mail with no sender address is grouped under the empty address. */
export function isNoAddressRow(row: { name: string }) {
  return row.name === "";
}

export function NoAddressSenderLabel({
  fromNameCount,
}: {
  fromNameCount: number;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/60"
      >
        <ShieldAlertIcon className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <div className="truncate font-medium">No sender address</div>
        <div className="truncate text-sm text-muted-foreground">
          {describeNameCount(fromNameCount)}
        </div>
      </div>
    </div>
  );
}

export function NoAddressActionCell({
  emailAccountId,
  mutate,
}: {
  emailAccountId: string;
  mutate: () => Promise<unknown>;
}) {
  const [mode, setMode] = useState<Mode | null>(null);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="w-[120px] justify-center"
        onClick={() => setMode("junk")}
      >
        Move to Junk
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-haspopup="true" size="icon" variant="ghost">
            <MoreHorizontalIcon className="size-4" />
            <span className="sr-only">Toggle menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setMode("archive")}>
            <ArchiveIcon className="mr-2 size-4" />
            <span>Archive All</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {mode && (
        <ReviewDialog
          mode={mode}
          emailAccountId={emailAccountId}
          mutate={mutate}
          onClose={() => setMode(null)}
        />
      )}
    </>
  );
}

function ReviewDialog({
  mode,
  emailAccountId,
  mutate,
  onClose,
}: {
  mode: Mode;
  emailAccountId: string;
  mutate: () => Promise<unknown>;
  onClose: () => void;
}) {
  const {
    data,
    error,
    isLoading,
    mutate: mutatePile,
  } = useSWR<NoAddressPileResponse>("/api/user/stats/no-address-pile");
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);

  const names = data?.names ?? [];
  const checkedNames = names.filter((pile) => !unchecked.has(pile.name));
  const emailCount = checkedNames.reduce((sum, pile) => sum + pile.count, 0);
  const allChecked = names.length > 0 && checkedNames.length === names.length;

  const toggle = (name: string) =>
    setUnchecked((current) => {
      const next = new Set(current);
      if (!next.delete(name)) next.add(name);
      return next;
    });

  const toggleAll = () =>
    setUnchecked(
      allChecked ? new Set(names.map((pile) => pile.name)) : new Set(),
    );

  const onConfirm = async () => {
    setWorking(true);
    try {
      const threads = uniqueThreads(checkedNames);
      const done =
        mode === "junk"
          ? await moveToJunk(emailAccountId, threads)
          : await archive(emailAccountId, threads);

      const movedEmails = done.succeeded.reduce(
        (sum, thread) => sum + thread.emails,
        0,
      );
      const failedEmails = threads
        .filter((thread) => !done.succeeded.includes(thread))
        .reduce((sum, thread) => sum + thread.emails, 0);

      if (done.succeeded.length) {
        toastUndo({
          message: `${mode === "junk" ? "Moved" : "Archived"} ${movedEmails} ${pluralEmails(movedEmails)}${mode === "junk" ? " to Junk" : ""}`,
          duration: 10_000,
          onUndo: () =>
            undoMove({
              emailAccountId,
              from: mode === "junk" ? "junk" : "archive",
              threadIds: done.succeeded.map((thread) => thread.threadId),
              emails: movedEmails,
              refresh: async () => {
                await mutate();
              },
            }),
        });
      }
      if (failedEmails) {
        toastError({
          title: `${failedEmails} ${pluralEmails(failedEmails)} could not be moved`,
          description: "They are still in your mailbox. Try again.",
        });
      }

      await Promise.all([mutate(), mutatePile()]);
      onClose();
    } catch (error) {
      captureException(error);
      toastError({
        title: mode === "junk" ? "Could not move to Junk" : "Could not archive",
        description:
          error instanceof Error ? error.message : "An unknown error occurred",
      });
    } finally {
      setWorking(false);
    }
  };

  const confirmLabel =
    mode === "junk"
      ? `Move ${emailCount} ${pluralEmails(emailCount, true)} to Junk`
      : `Archive ${emailCount} ${pluralEmails(emailCount, true)}`;

  return (
    <Dialog open onOpenChange={(open) => !open && !working && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "junk" ? "Move to Junk" : "Archive All"}
          </DialogTitle>
          <DialogDescription>
            These emails have no sender address. Untick any name to leave its
            emails alone.
          </DialogDescription>
        </DialogHeader>

        <LoadingContent loading={isLoading} error={error}>
          {names.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No emails left to move
            </p>
          ) : (
            <div className="rounded-lg border">
              <div className="flex items-center gap-3 border-b px-3 py-2 text-sm text-muted-foreground">
                <ButtonCheckbox
                  label={allChecked ? "Untick all names" : "Tick all names"}
                  checked={allChecked}
                  indeterminate={checkedNames.length > 0 && !allChecked}
                  onChange={toggleAll}
                />
                <span className="flex-1">Name</span>
                <span>Emails</span>
              </div>
              <ul className="max-h-[min(50vh,420px)] overflow-y-auto">
                {names.map((pile) => (
                  <NameRow
                    key={pile.name}
                    pile={pile}
                    checked={!unchecked.has(pile.name)}
                    onToggle={() => toggle(pile.name)}
                  />
                ))}
              </ul>
            </div>
          )}
        </LoadingContent>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={working}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={working || emailCount === 0}>
            {working && <ButtonLoader />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NameRow({
  pile,
  checked,
  onToggle,
}: {
  pile: PileName;
  checked: boolean;
  onToggle: () => void;
}) {
  const name = pile.name || "No display name";

  return (
    // The checkbox is the keyboard control; the row is a larger mouse target.
    // biome-ignore lint/a11y/useKeyWithClickEvents: the checkbox button inside is the keyboard control
    <li
      className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-muted/50"
      onClick={onToggle}
    >
      <ButtonCheckbox
        label={`Include ${name}`}
        checked={checked}
        onChange={onToggle}
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          !checked && "text-muted-foreground",
        )}
      >
        {name}
      </span>
      <span className="tabular-nums text-muted-foreground">{pile.count}</span>
    </li>
  );
}

type PileThread = { threadId: string; messageIds: string[]; emails: number };

function uniqueThreads(names: PileName[]): PileThread[] {
  const byThread = new Map<string, PileThread>();
  for (const pile of names) {
    for (const thread of pile.threads) {
      const existing = byThread.get(thread.threadId);
      if (existing) {
        existing.messageIds = [
          ...new Set([...existing.messageIds, ...thread.messageIds]),
        ];
        existing.emails = existing.messageIds.length;
      } else {
        byThread.set(thread.threadId, {
          threadId: thread.threadId,
          messageIds: [...thread.messageIds],
          emails: thread.messageIds.length,
        });
      }
    }
  }
  return [...byThread.values()];
}

async function moveToJunk(emailAccountId: string, threads: PileThread[]) {
  const succeeded: PileThread[] = [];
  for (const batch of chunk(threads, MOVE_THREADS_ACTION_LIMIT)) {
    const result = await moveThreadsToJunkAction(emailAccountId, {
      threadIds: batch.map((thread) => thread.threadId),
    });
    assertActionSucceeded(result);
    const ok = new Set(result?.data?.succeededThreadIds);
    succeeded.push(...batch.filter((thread) => ok.has(thread.threadId)));
  }
  return { succeeded };
}

async function archive(emailAccountId: string, threads: PileThread[]) {
  const succeeded: PileThread[] = [];
  for (const batch of chunk(threads, BULK_ARCHIVE_THREADS_ACTION_LIMIT)) {
    const result = await bulkArchiveThreadsAction(emailAccountId, {
      threads: batch.map(({ threadId, messageIds }) => ({
        threadId,
        messageIds,
      })),
    });
    assertActionSucceeded(result);
    const ok = new Set(result?.data?.succeededThreadIds);
    succeeded.push(...batch.filter((thread) => ok.has(thread.threadId)));
  }
  return { succeeded };
}

async function undoMove({
  emailAccountId,
  from,
  threadIds,
  emails,
  refresh,
}: {
  emailAccountId: string;
  from: "junk" | "archive";
  threadIds: string[];
  emails: number;
  refresh: () => Promise<void>;
}) {
  try {
    for (const batch of chunk(threadIds, MOVE_THREADS_ACTION_LIMIT)) {
      const result = await restoreThreadsToInboxAction(emailAccountId, {
        threadIds: batch,
        from,
      });
      assertActionSucceeded(result);
      if (result?.data?.failedThreadIds.length) {
        throw new Error("Some emails could not be moved back");
      }
    }
    toastSuccess({
      description: `Moved ${emails} ${pluralEmails(emails)} back to your inbox`,
    });
    await refresh();
  } catch (error) {
    captureException(error);
    toastError({
      title: "Could not undo",
      description:
        error instanceof Error ? error.message : "An unknown error occurred",
    });
  }
}

function describeNameCount(count: number) {
  if (count === 0) return "No display names";
  return `${count} different ${count === 1 ? "name" : "names"}`;
}

function pluralEmails(count: number, capitalize = false) {
  const word = count === 1 ? "email" : "emails";
  return capitalize ? `${word[0].toUpperCase()}${word.slice(1)}` : word;
}
