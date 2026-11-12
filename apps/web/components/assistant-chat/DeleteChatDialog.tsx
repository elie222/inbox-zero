"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useAction } from "next-safe-action/hooks";
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
import { toastError, toastSuccess } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import { deleteChatAction } from "@/utils/actions/chat";
import { getActionErrorMessage } from "@/utils/error";

export function DeleteChatDialog({
  open,
  onOpenChange,
  chatId,
  label,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: string;
  label: string;
  onDeleted: () => void;
}) {
  const { t } = useLingui();
  const { emailAccountId } = useAccount();
  const { execute, isExecuting } = useAction(
    deleteChatAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: t`Chat deleted.` });
        onDeleted();
        onOpenChange(false);
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error, {
            prefix: t`Failed to delete chat`,
          }),
        });
      },
    },
  );

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Delete chat?</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>
              &ldquo;{label}&rdquo; will be removed from your chat history and
              its messages will be redacted. This action cannot be undone.
            </Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isExecuting}>
            <Trans>Cancel</Trans>
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              execute({ chatId });
            }}
            disabled={isExecuting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isExecuting ? <Trans>Deleting...</Trans> : <Trans>Delete</Trans>}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
