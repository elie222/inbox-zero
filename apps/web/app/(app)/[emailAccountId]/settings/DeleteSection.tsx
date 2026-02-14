"use client";

import { useState } from "react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { usePremium } from "@/components/PremiumAlert";

export function DeleteSection() {
  const { onCancelLoadBatch } = useStatLoader();
  const { premium } = usePremium();

  const hasSubscription =
    premium?.stripeSubscriptionId || premium?.lemonSqueezySubscriptionId;

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
        error: (err) => `Error deleting account: ${err.message}`,
      },
    );
  };

  const handleConfirmCancellation = () => {
    setHasConfirmedCancellation(true);
  };

  const shouldBlockDeletion = hasSubscription && !hasConfirmedCancellation;

  return (
    <Item size="sm">
      <ItemContent>
        <ItemTitle>Delete account</ItemTitle>
        <ItemDescription>
          Permanently delete your account and all data.
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
                  : "Are you absolutely sure?"}
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
                      </p>
                      <p className="text-sm text-gray-600">
                        Already cancelled your subscription? Click the button
                        below to proceed.
                      </p>
                    </>
                  ) : (
                    <p>
                      This action cannot be undone. This will permanently delete
                      your user and all associated accounts.
                    </p>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              {shouldBlockDeletion ? (
                <AlertDialogAction onClick={handleConfirmCancellation}>
                  I've already cancelled my subscription
                </AlertDialogAction>
              ) : (
                <AlertDialogAction onClick={handleDeleteAccount}>
                  Delete account
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ItemActions>
    </Item>
  );
}
