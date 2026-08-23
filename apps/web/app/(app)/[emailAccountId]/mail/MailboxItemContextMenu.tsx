"use client";

import { type FormEvent, type ReactNode, useState } from "react";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  OUTLOOK_CATEGORY_COLORS,
  type OutlookCategoryColor,
} from "@/utils/outlook/category-colors";
import { cn } from "@/utils";

export type MailboxItem = {
  id: string;
  kind: "label" | "folder";
  name: string;
};

export type MailboxItemEdit =
  | MailboxItem
  | { id: string; kind: "label"; color: OutlookCategoryColor };

export function MailboxItemContextMenu({
  children,
  item,
  typeName,
  editMode,
  currentColor,
  onEdit,
  onDelete,
}: {
  children: ReactNode;
  item: MailboxItem;
  typeName: string;
  editMode: "name" | "color";
  currentColor?: string | null;
  onEdit: (edit: MailboxItemEdit) => Promise<boolean>;
  onDelete: (item: MailboxItem) => Promise<boolean>;
}) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [name, setName] = useState(item.name);
  const [color, setColor] = useState<OutlookCategoryColor>("preset5");

  const openEditor = () => {
    setName(item.name);
    setColor(
      OUTLOOK_CATEGORY_COLORS.find(
        (option) => option.value.toLowerCase() === currentColor?.toLowerCase(),
      )?.id ?? "preset5",
    );
    setIsEditOpen(true);
  };

  const submitEdit = async (event: FormEvent) => {
    event.preventDefault();
    const nextName = name.trim();
    if (editMode === "name" && !nextName) return;

    setIsSaving(true);
    try {
      const success = await onEdit(
        editMode === "color"
          ? { kind: "label", id: item.id, color }
          : { ...item, name: nextName },
      );
      if (success) setIsEditOpen(false);
    } catch {
      toast.error(`Failed to update ${typeName}. Please try again.`);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteItem = async () => {
    setIsDeleting(true);
    try {
      const success = await onDelete(item);
      if (success) setIsDeleteOpen(false);
    } catch {
      toast.error(`Failed to delete ${typeName}. Please try again.`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div>{children}</div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-40">
          <ContextMenuItem className="gap-2" onSelect={openEditor}>
            <PencilIcon className="size-4" />
            Edit
          </ContextMenuItem>
          <ContextMenuItem
            className="gap-2 text-destructive focus:text-destructive"
            onSelect={() => setIsDeleteOpen(true)}
          >
            <Trash2Icon className="size-4" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {typeName}</DialogTitle>
            <DialogDescription>
              {editMode === "color"
                ? `Choose a color for “${item.name}”.`
                : `Choose a new name for “${item.name}”.`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitEdit}>
            {editMode === "color" ? (
              <div
                role="radiogroup"
                aria-label="Category color"
                className="grid grid-cols-5 gap-3 py-1"
              >
                {OUTLOOK_CATEGORY_COLORS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-label={option.name}
                    aria-checked={color === option.id}
                    onClick={() => setColor(option.id)}
                    className={cn(
                      "mx-auto size-8 rounded-full border-2 border-background shadow-sm ring-offset-2 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      color === option.id && "ring-2 ring-ring",
                    )}
                    style={{ backgroundColor: option.value }}
                  />
                ))}
              </div>
            ) : (
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-label={`${typeName} name`}
                autoFocus
                maxLength={255}
              />
            )}
            <DialogFooter className="mt-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditOpen(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={isSaving}
                disabled={editMode === "name" && !name.trim()}
              >
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {typeName}?</AlertDialogTitle>
            <AlertDialogDescription>
              {item.kind === "folder"
                ? `“${item.name}” and its contents will be removed from your mailbox.`
                : `“${item.name}” will be removed from your mailbox. Emails using it will remain.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async (event) => {
                event.preventDefault();
                await deleteItem();
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
