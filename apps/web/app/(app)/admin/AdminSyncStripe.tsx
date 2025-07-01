"use client";

import { useAction } from "next-safe-action/hooks";
import { adminSyncStripeForAllUsersAction } from "@/utils/actions/admin";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/components/Toast";

export const AdminSyncStripe = () => {
  const { execute, isExecuting } = useAction(adminSyncStripeForAllUsersAction, {
    onSuccess: () => {
      toastSuccess({
        title: "Stripe synced",
        description: "Stripe synced",
      });
    },
    onError: (error) => {
      toastError({
        title: "Error syncing Stripe",
        description: error.error.serverError || "Unknown error",
      });
    },
  });

  return (
    <Button onClick={() => execute()} loading={isExecuting} variant="outline">
      Sync Stripe
    </Button>
  );
};
