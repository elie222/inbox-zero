"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteKnowledgeAction } from "@/utils/actions/knowledge";
import { toastError, toastSuccess } from "@/components/Toast";
import { LoadingContent } from "@/components/LoadingContent";
import { formatDateSimple } from "@/utils/date";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { KnowledgeForm } from "@/app/(app)/[emailAccountId]/assistant/knowledge/KnowledgeForm";
import { useAccount } from "@/providers/EmailAccountProvider";
import type { GetKnowledgeResponse } from "@/app/api/knowledge/route";
import type { Knowledge } from "@prisma/client";

export function KnowledgeBase() {
  const { emailAccountId } = useAccount();
  const [isOpen, setIsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Knowledge | null>(null);
  const { data, isLoading, error, mutate } =
    useSWR<GetKnowledgeResponse>("/api/knowledge");

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setEditingItem(null);
  }, []);

  const onOpenChange = useCallback((open: boolean) => {
    if (!open) setEditingItem(null);
    setIsOpen(open);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between">
        <Dialog open={isOpen || !!editingItem} onOpenChange={onOpenChange}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Add
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingItem ? "Edit Knowledge" : "Add Knowledge"}
              </DialogTitle>
            </DialogHeader>
            <KnowledgeForm
              closeDialog={handleClose}
              refetch={mutate}
              editingItem={editingItem}
              knowledgeItemsCount={data?.items.length || 0}
            />
          </DialogContent>
        </Dialog>

        <p className="ml-4 text-sm text-muted-foreground">
          The knowledge base is used to help draft responses to emails
        </p>
      </div>

      <Card className="mt-2">
        <LoadingContent loading={isLoading} error={error}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3}>
                    <div className="mx-auto my-8 max-w-prose text-center">
                      <p>
                        Knowledge base entries are used to help draft responses
                        to emails.
                        <br />
                        Click "Add" to create one.
                      </p>
                      <div className="mt-4">
                        <strong className="text-left">Notes:</strong>
                        <ul className="mt-2 list-disc space-y-1 text-left">
                          <li>
                            Placing all knowledge in one entry is perfectly
                            fine.
                          </li>
                          <li>
                            When our AI drafts replies it also has access to
                            previous conversations with the person you're
                            talking to.
                          </li>
                          <li>
                            This information is only used to draft replies.
                          </li>
                        </ul>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                data?.items.map((item) => (
                  <KnowledgeTableRow
                    key={item.id}
                    item={item}
                    onEdit={() => setEditingItem(item)}
                    onDelete={mutate}
                    emailAccountId={emailAccountId}
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

function KnowledgeTableRow({
  item,
  onEdit,
  onDelete,
  emailAccountId,
}: {
  item: Knowledge;
  onEdit: () => void;
  onDelete: () => void;
  emailAccountId: string;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  return (
    <TableRow>
      <TableCell>{item.title}</TableCell>
      <TableCell>{formatDateSimple(new Date(item.updatedAt))}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <ConfirmDialog
            trigger={
              <Button variant="outline" size="sm" loading={isDeleting}>
                <Trash2 className="h-4 w-4" />
              </Button>
            }
            title="Delete Knowledge Base Entry"
            description={`Are you sure you want to delete "${item.title}"? This action cannot be undone.`}
            confirmText="Delete"
            onConfirm={async () => {
              try {
                setIsDeleting(true);
                const result = await deleteKnowledgeAction(emailAccountId, {
                  id: item.id,
                });
                if (result?.serverError) {
                  toastError({
                    title: "Error deleting knowledge base entry",
                    description: result.serverError || "",
                  });
                  return;
                }
                toastSuccess({
                  description: "Knowledge base entry deleted successfully",
                });
                onDelete();
              } finally {
                setIsDeleting(false);
              }
            }}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}
