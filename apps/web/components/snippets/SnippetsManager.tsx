"use client";

import { useCallback, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError, toastSuccess } from "@/components/Toast";
import { SnippetForm } from "@/components/snippets/SnippetForm";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useSnippets } from "@/hooks/useSnippets";
import { deleteSnippetAction } from "@/utils/actions/snippet";
import type { GetSnippetsResponse } from "@/app/api/user/snippets/route";

type SnippetItem = GetSnippetsResponse["snippets"][number];

export function SnippetsManager() {
  const { emailAccountId } = useAccount();
  const { data, error, isLoading, mutate } = useSnippets();
  const [isOpen, setIsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SnippetItem | null>(null);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setEditingItem(null);
  }, []);

  return (
    <div>
      <Dialog
        onOpenChange={(open) => {
          if (!open) setEditingItem(null);
          setIsOpen(open);
        }}
        open={isOpen || !!editingItem}
      >
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? "Edit snippet" : "Add snippet"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {editingItem ? "Edit this snippet." : "Add a reusable snippet."}
            </DialogDescription>
          </DialogHeader>
          <SnippetForm
            closeDialog={handleClose}
            editingItem={editingItem}
            refetch={() => {
              mutate();
            }}
          />
        </DialogContent>
      </Dialog>

      <Card className="mt-2">
        <LoadingContent error={error} loading={isLoading}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Shortcut</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.snippets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3}>
                    <Empty className="border-0">
                      <EmptyHeader>
                        <EmptyTitle>No snippets yet</EmptyTitle>
                        <EmptyDescription>
                          Save replies you reuse often, then type / in a draft
                          to insert them.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                data?.snippets.map((item) => (
                  <SnippetTableRow
                    emailAccountId={emailAccountId}
                    item={item}
                    key={item.id}
                    onDelete={() => {
                      mutate();
                    }}
                    onEdit={() => setEditingItem(item)}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </LoadingContent>
      </Card>
    </div>
  );
}

function SnippetTableRow({
  emailAccountId,
  item,
  onDelete,
  onEdit,
}: {
  emailAccountId: string;
  item: SnippetItem;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  return (
    <TableRow>
      <TableCell>{item.name}</TableCell>
      <TableCell>/{item.shortcut}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          <Button onClick={onEdit} size="sm" variant="outline">
            Edit
          </Button>
          <ConfirmDialog
            confirmText="Delete"
            description={`Delete /${item.shortcut}? This cannot be undone.`}
            onConfirm={async () => {
              try {
                setIsDeleting(true);
                const result = await deleteSnippetAction(emailAccountId, {
                  id: item.id,
                });
                if (result?.serverError) {
                  toastError({
                    title: "Error deleting snippet",
                    description: result.serverError,
                  });
                  return;
                }
                toastSuccess({ description: "Snippet deleted" });
                onDelete();
              } finally {
                setIsDeleting(false);
              }
            }}
            title="Delete snippet"
            trigger={
              <Button loading={isDeleting} size="sm" variant="outline">
                <Trash2 className="h-4 w-4" />
              </Button>
            }
          />
        </div>
      </TableCell>
    </TableRow>
  );
}
