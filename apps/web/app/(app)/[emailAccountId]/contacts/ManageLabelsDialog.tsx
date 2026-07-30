"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { Trash2Icon } from "lucide-react";
import type { LabelSummary } from "@/utils/contacts";
import {
  deleteCompanyLabelAction,
  updateCompanyLabelAction,
} from "@/utils/actions/contact";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getActionErrorMessage } from "@/utils/error";
import { toastError, toastSuccess } from "@/components/Toast";
import { cn } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Rename, re-parent, or delete company labels. Deleting only removes the
// label itself: its companies become unlabeled and nested labels move up.
export function ManageLabelsDialog({
  labels,
  open,
  onClose,
  mutate,
}: {
  labels: LabelSummary[];
  open: boolean;
  onClose: () => void;
  mutate: () => void;
}) {
  // Children indented under their parents, everything else A→Z
  const topLevel = labels.filter((label) => !label.parentId);
  const rows = topLevel.flatMap((parent) => [
    { label: parent, indent: false },
    ...labels
      .filter((label) => label.parentId === parent.id)
      .map((child) => ({ label: child, indent: true })),
  ]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage labels</DialogTitle>
        </DialogHeader>
        {rows.length ? (
          <div className="space-y-2">
            {rows.map(({ label, indent }) => (
              <LabelRow
                // Remount after saves so the row resyncs to fresh data
                key={`${label.id}:${label.name}:${label.parentId}`}
                label={label}
                labels={labels}
                indent={indent}
                mutate={mutate}
              />
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No labels yet — add one from a company's Details tab.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Deleting a label keeps its companies — they just become unlabeled.
          Labels nested under a deleted label move to the top level.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function LabelRow({
  label,
  labels,
  indent,
  mutate,
}: {
  label: LabelSummary;
  labels: LabelSummary[];
  indent: boolean;
  mutate: () => void;
}) {
  const { emailAccountId } = useAccount();
  const [name, setName] = useState(label.name);
  const [parentId, setParentId] = useState(label.parentId ?? "none");

  const update = useAction(
    updateCompanyLabelAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Label saved" });
        mutate();
      },
      onError: (error) => {
        toastError({ description: getActionErrorMessage(error.error) });
      },
    },
  );

  const del = useAction(deleteCompanyLabelAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Label deleted" });
      mutate();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  // Only top-level labels can be parents; a label holding children can't
  // nest (the server enforces both — this just hides invalid options)
  const parentOptions = labels.filter(
    (candidate) => !candidate.parentId && candidate.id !== label.id,
  );
  const hasChildren = labels.some(
    (candidate) => candidate.parentId === label.id,
  );

  const dirty =
    name.trim() !== label.name ||
    (parentId === "none" ? null : parentId) !== label.parentId;

  return (
    // At phone width the name input gets its own line — the select and
    // buttons alone nearly fill a 320px dialog
    <div className={cn("flex flex-wrap items-center gap-2", indent && "pl-6")}>
      <Input
        value={name}
        aria-label="Label name"
        className="min-w-0 basis-full sm:basis-0 sm:flex-1"
        onChange={(event) => setName(event.target.value)}
      />
      <Select
        value={parentId}
        onValueChange={setParentId}
        disabled={hasChildren}
      >
        <SelectTrigger
          className="w-36 shrink-0"
          aria-label={
            hasChildren
              ? "Has nested labels, so it can't get a parent"
              : "Parent label"
          }
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No parent</SelectItem>
          {parentOptions.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        disabled={!dirty || !name.trim()}
        loading={update.isExecuting}
        onClick={() =>
          update.execute({
            id: label.id,
            name: name.trim(),
            parentId: parentId === "none" ? null : parentId,
          })
        }
      >
        Save
      </Button>
      <Button
        variant="ghost"
        size="iconSm"
        className="shrink-0"
        loading={del.isExecuting}
        onClick={() => {
          const yes = confirm(
            `Delete the label ${label.name}? Its companies stay, they just become unlabeled${hasChildren ? ", and its nested labels move to the top level" : ""}.`,
          );
          if (yes) del.execute({ id: label.id });
        }}
      >
        <Trash2Icon className="size-4" />
        <span className="sr-only">Delete label</span>
      </Button>
    </div>
  );
}
