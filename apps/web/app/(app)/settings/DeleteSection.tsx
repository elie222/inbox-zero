"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormSection, FormSectionLeft } from "@/components/Form";
import {
  deleteAccountAction,
  resetAnalyticsAction,
} from "@/utils/actions/user";
import { logOut } from "@/utils/user";
import { isActionError } from "@/utils/error";
import { useStatLoader } from "@/providers/StatLoaderProvider";

export function DeleteSection() {
  const { onCancelLoadBatch } = useStatLoader();

  return (
    <FormSection>
      <FormSectionLeft
        title="Delete account"
        description="No longer want to use our service? You can delete your account here. This action is not reversible. All information related to this account will be deleted permanently."
      />

      <div className="flex items-start gap-2 md:col-span-2">
        <Button
          variant="outline"
          onClick={async () => {
            toast.promise(() => resetAnalyticsAction(), {
              loading: "Resetting analytics...",
              success: () => {
                return "Analytics reset! Visit the Unsubscriber or Analytics page and click the 'Load More' button to reload your data.";
              },
              error: (err) => {
                return `Error resetting analytics: ${err.message}`;
              },
            });
          }}
        >
          Reset Analytics
        </Button>

        <Button
          variant="outline"
          onClick={async () => {
            onCancelLoadBatch();
            const yes = window.confirm(
              "Are you sure you want to delete your account?",
            );

            if (!yes) return;

            toast.promise(
              async () => {
                const result = await deleteAccountAction();
                await logOut("/");
                if (isActionError(result)) throw new Error(result.error);
              },
              {
                loading: "Deleting account...",
                success: "Account deleted!",
                error: (err) => `Error deleting account: ${err.message}`,
              },
            );
          }}
        >
          Yes, delete my account
        </Button>
      </div>
    </FormSection>
  );
}
