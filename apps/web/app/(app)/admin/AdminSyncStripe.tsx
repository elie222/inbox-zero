"use client";

import { useAction } from "next-safe-action/hooks";
import {
  adminSyncStripeForAllUsersAction,
  adminSyncAllStripeCustomersToDbAction,
} from "@/utils/actions/admin";
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

export const AdminSyncStripeCustomers = () => {
  const { execute, isExecuting } = useAction(
    adminSyncAllStripeCustomersToDbAction,
    {
      onSuccess: (result) => {
        toastSuccess({
          title: "Stripe customers synced",
          description:
            result.data?.success || "All Stripe customers synced to database",
        });
      },
      onError: (error) => {
        toastError({
          title: "Error syncing Stripe customers",
          description: error.error.serverError || "Unknown error",
        });
      },
    },
  );

  return (
    <Button onClick={() => execute()} loading={isExecuting} variant="outline">
      Sync All Stripe Customers to DB
    </Button>
  );
};
