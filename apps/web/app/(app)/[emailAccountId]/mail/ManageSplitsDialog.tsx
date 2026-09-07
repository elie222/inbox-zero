"use client";

import { useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  GripVerticalIcon,
  Settings2Icon,
  Trash2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { MailSplitTab } from "@/app/(app)/[emailAccountId]/mail/SplitTabs";

export function ManageSplitsDialog({
  splits,
  onDelete,
  onReorder,
}: {
  splits: MailSplitTab[];
  onDelete: (id: string) => Promise<void>;
  onReorder: (ids: string[]) => Promise<void>;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const move = async (id: string, targetId: string) => {
    if (isSaving || id === targetId) return;
    const ids = splits.map((split) => split.id);
    const from = ids.indexOf(id);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, id);
    setIsSaving(true);
    try {
      await onReorder(ids);
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (id: string) => {
    setIsSaving(true);
    try {
      await onDelete(id);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 rounded-full text-muted-foreground"
          aria-label="Manage splits"
        >
          <Settings2Icon className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage splits</DialogTitle>
          <DialogDescription>
            Drag tabs into order or use the arrows. Removing a split does not
            delete its emails or labels. Changes save automatically.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2" aria-label="Split order" aria-busy={isSaving}>
          {splits.map((split, index) => (
            <li
              key={split.id}
              className="flex items-center gap-2 rounded-lg border bg-background p-2"
              onDragOver={(event) => {
                if (draggedId && !isSaving) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (draggedId) move(draggedId, split.id);
                setDraggedId(null);
              }}
            >
              <span
                draggable={!isSaving}
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/plain", split.id);
                  event.dataTransfer.effectAllowed = "move";
                  setDraggedId(split.id);
                }}
                onDragEnd={() => setDraggedId(null)}
                className="cursor-grab p-1 text-muted-foreground active:cursor-grabbing"
                aria-hidden="true"
                data-drag-split={split.id}
              >
                <GripVerticalIcon className="size-4" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {split.name}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Move ${split.name} up`}
                disabled={isSaving || index === 0}
                onClick={() => move(split.id, splits[index - 1].id)}
              >
                <ArrowUpIcon className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Move ${split.name} down`}
                disabled={isSaving || index === splits.length - 1}
                onClick={() => move(split.id, splits[index + 1].id)}
              >
                <ArrowDownIcon className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-destructive"
                aria-label={`Remove the ${split.name} split`}
                disabled={isSaving}
                onClick={() => remove(split.id)}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
        {!splits.length && (
          <p className="text-muted-foreground text-sm">
            No splits yet. Use the + button to add one.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
