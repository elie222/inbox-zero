"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import { Plus, Trash2 } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
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
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { KnowledgeForm } from "@/app/(app)/[emailAccountId]/assistant/knowledge/KnowledgeForm";
import { useAccount } from "@/providers/EmailAccountProvider";
import type { GetKnowledgeResponse } from "@/app/api/knowledge/route";
import type { Knowledge } from "@/generated/prisma/client";

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
      <Dialog open={isOpen || !!editingItem} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            <Trans>Add</Trans>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? (
                <Trans>Edit Knowledge</Trans>
              ) : (
                <Trans>Add Knowledge</Trans>
              )}
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

      <Card className="mt-2">
        <LoadingContent loading={isLoading} error={error}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Trans>Title</Trans>
                </TableHead>
                <TableHead>
                  <Trans>Last Updated</Trans>
                </TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3}>
                    <Empty className="border-0">
                      <EmptyHeader>
                        <EmptyTitle>
                          <Trans>No knowledge entries yet</Trans>
                        </EmptyTitle>
                        <EmptyDescription>
                          <Trans>
                            Add information about your work, projects, or
                            preferences. The assistant uses this when drafting
                            replies.
                          </Trans>
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
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
  const { t, i18n } = useLingui();
  const [isDeleting, setIsDeleting] = useState(false);

  return (
    <TableRow>
      <TableCell>{item.title}</TableCell>
      <TableCell>
        {formatDateSimple(new Date(item.updatedAt), i18n.locale)}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Trans>Edit</Trans>
          </Button>
          <ConfirmDialog
            trigger={
              <Button variant="outline" size="sm" loading={isDeleting}>
                <Trash2 className="h-4 w-4" />
              </Button>
            }
            title={t`Delete Knowledge Base Entry`}
            description={t`Are you sure you want to delete "${item.title}"? This action cannot be undone.`}
            confirmText={t`Delete`}
            onConfirm={async () => {
              try {
                setIsDeleting(true);
                const result = await deleteKnowledgeAction(emailAccountId, {
                  id: item.id,
                });
                if (result?.serverError) {
                  toastError({
                    title: t`Error deleting knowledge base entry`,
                    description: result.serverError || "",
                  });
                  return;
                }
                toastSuccess({
                  description: t`Knowledge base entry deleted successfully`,
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
