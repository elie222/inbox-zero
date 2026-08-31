"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import type { GetEmailAccountsResponse } from "@/app/api/user/email-accounts/route";
import { ProfileImage } from "@/components/ProfileImage";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { updateAllAccountsSelectionAction } from "@/utils/actions/all-accounts";
import { getActionErrorMessage } from "@/utils/error";

export function AllAccountsSelectionDialog({
  emailAccounts,
  onClose,
  onSaved,
}: {
  emailAccounts: GetEmailAccountsResponse["emailAccounts"];
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const [selectedAccountIds, setSelectedAccountIds] = useState(
    () =>
      new Set(
        emailAccounts
          .filter((emailAccount) => emailAccount.includeInAllAccounts)
          .map((emailAccount) => emailAccount.id),
      ),
  );
  const { execute, isExecuting } = useAction(updateAllAccountsSelectionAction, {
    onSuccess: async () => {
      await onSaved();
      toastSuccess({ description: "All Accounts updated" });
      onClose();
    },
    onError: (error) => {
      toastError({
        description: getActionErrorMessage(error.error, {
          prefix: "Couldn't update All Accounts",
        }),
      });
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Choose accounts</DialogTitle>
          <DialogDescription>
            Select which inboxes appear in All Accounts. You can still open any
            account separately. Keep at least one selected.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[50vh] gap-1 overflow-y-auto py-2">
          {emailAccounts.map((emailAccount) => {
            const checked = selectedAccountIds.has(emailAccount.id);
            const isOnlySelected = checked && selectedAccountIds.size === 1;

            return (
              <label
                className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-muted has-[:disabled]:cursor-default has-[:disabled]:opacity-60"
                htmlFor={`all-accounts-${emailAccount.id}`}
                key={emailAccount.id}
              >
                <Checkbox
                  id={`all-accounts-${emailAccount.id}`}
                  checked={checked}
                  disabled={isExecuting || isOnlySelected}
                  onCheckedChange={(nextChecked) => {
                    setSelectedAccountIds((current) => {
                      const next = new Set(current);
                      if (nextChecked === true) {
                        next.add(emailAccount.id);
                      } else {
                        next.delete(emailAccount.id);
                      }
                      return next;
                    });
                  }}
                />
                <ProfileImage
                  className="size-9"
                  image={emailAccount.image}
                  label={emailAccount.name || emailAccount.email}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-sm">
                    {emailAccount.name || emailAccount.email}
                  </span>
                  {emailAccount.name ? (
                    <span className="block truncate text-muted-foreground text-xs">
                      {emailAccount.email}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isExecuting}>
            Cancel
          </Button>
          <Button
            loading={isExecuting}
            onClick={() =>
              execute({ emailAccountIds: [...selectedAccountIds] })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
