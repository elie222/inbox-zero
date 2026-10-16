"use client";

import { useState } from "react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
} from "@/components/ui/item";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteAccountAction } from "@/utils/actions/user";
import { logOut } from "@/utils/user";
import { useStatLoader } from "@/providers/StatLoaderProvider";
import { usePremium } from "@/hooks/usePremium";
import { hasActiveAppleSubscription } from "@/utils/premium";
import { useAccounts } from "@/hooks/useAccounts";

export function DeleteSection() {
  const { onCancelLoadBatch } = useStatLoader();
  const { premium } = usePremium();
  const { data: accountsData } = useAccounts();
  const connectedEmails =
    accountsData?.emailAccounts.map((account) => account.email) ?? [];
  const hasAppleSubscription = hasActiveAppleSubscription(
    premium?.appleExpiresAt || null,
    premium?.appleRevokedAt || null,
    premium?.appleSubscriptionStatus || null,
  );

  const hasSubscription =
    premium?.stripeSubscriptionId ||
    premium?.lemonSqueezySubscriptionId ||
    hasAppleSubscription;

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [hasConfirmedCancellation, setHasConfirmedCancellation] =
    useState(false);

  const { executeAsync: executeDeleteAccount } = useAction(
    deleteAccountAction.bind(null),
  );

  const handleDeleteAccount = async () => {
    onCancelLoadBatch();
    setIsDialogOpen(false);

    toast.promise(
      async () => {
        const result = await executeDeleteAccount();
        await logOut("/");
        if (result?.serverError) throw new Error(result.serverError);
      },
      {
        loading: "Deleting account...",
        success: "Account deleted!",
        error: (err: unknown) =>
          `Error deleting account: ${
            err instanceof Error ? err.message : "Unknown error"
          }`,
      },
    );
  };

  const shouldBlockDeletion = hasSubscription && !hasConfirmedCancellation;

  return (
    <Item size="sm">
      <ItemContent>
        <ItemTitle>Delete Inbox Zero account</ItemTitle>
        <ItemDescription>
          Removes your Inbox Zero data. Your email accounts are not affected.
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructiveSoft" size="sm">
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {shouldBlockDeletion
                  ? "Cancel subscription first"
                  : "Delete your Inbox Zero account?"}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div>
                  {shouldBlockDeletion ? (
                    <>
                      <p className="mb-3">
                        Please cancel your subscription before deleting your
                        account.
                      </p>
                      <p className="mb-3">
                        {hasAppleSubscription ? (
                          <>
                            You can manage your subscription from your iPhone or
                            iPad subscription settings.
                          </>
                        ) : (
                          <>
                            You can manage your subscription by clicking "Manage
                            Subscription" above or going to the{" "}
                            <Link
                              href="/premium"
                              className="text-blue-600 underline hover:text-blue-800"
                              onClick={() => setIsDialogOpen(false)}
                            >
                              premium page
                            </Link>{" "}
                            and clicking "Manage subscription".
                          </>
                        )}
                      </p>
                      <p className="text-sm text-gray-600">
                        Already cancelled your subscription? Click the button
                        below to proceed.
                      </p>
                    </>
                  ) : (
                    <div className="space-y-3">
                      <p>
                        This permanently deletes your Inbox Zero account,
                        including your rules, settings, and the data we store.
                        It can't be undone.
                      </p>
                      {connectedEmails.length > 0 && (
                        <div>
                          <p>These email accounts will be disconnected:</p>
                          <ul className="mt-1 list-disc pl-5 font-medium text-foreground">
                            {connectedEmails.map((email) => (
                              <li key={email}>{email}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <p>
                        Your mailboxes and the emails in them are not deleted.
                      </p>
                      {connectedEmails.length > 1 && (
                        <p>
                          Only want to remove one email account?{" "}
                          <Link
                            href="/accounts"
                            className="text-foreground underline"
                            onClick={() => setIsDialogOpen(false)}
                          >
                            Manage accounts
                          </Link>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              {shouldBlockDeletion ? (
                <AlertDialogAction
                  onClick={(event) => {
                    // Keep the dialog open so it advances to the delete confirmation
                    event.preventDefault();
                    setHasConfirmedCancellation(true);
                  }}
                >
                  I've already cancelled my subscription
                </AlertDialogAction>
              ) : (
                <AlertDialogAction
                  className={buttonVariants({ variant: "destructive" })}
                  onClick={handleDeleteAccount}
                >
                  Delete Inbox Zero account
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ItemActions>
    </Item>
  );
}
