"use client";

import { useAction } from "next-safe-action/hooks";
import {
  adminSyncStripeForAllUsersAction,
  adminSyncAllStripeCustomersToDbAction,
  adminBackfillPremiumAdminsAction,
} from "@/utils/actions/admin";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/components/Toast";
import { getActionErrorMessage } from "@/utils/error";

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
        description: getActionErrorMessage(error.error),
      });
    },
  });

  return (
    <Button onClick={() => execute()} loading={isExecuting} variant="outline">
      Sync Stripe
    </Button>
  );
};

export const AdminBackfillPremiumAdmins = () => {
  const { execute, isExecuting } = useAction(adminBackfillPremiumAdminsAction, {
    onSuccess: (result) => {
      toastSuccess({
        title: "Premium admins backfilled",
        description: `Backfilled ${result.data?.backfilled ?? 0} premiums, skipped ${result.data?.skipped ?? 0}`,
      });
    },
    onError: (error) => {
      toastError({
        title: "Error backfilling premium admins",
        description: getActionErrorMessage(error.error),
      });
    },
  });

  return (
    <Button onClick={() => execute()} loading={isExecuting} variant="outline">
      Backfill Premium Admins
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
          description: getActionErrorMessage(error.error),
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
