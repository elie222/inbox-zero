"use client";

import { toast } from "sonner";
import { Button } from "@/components/Button";
import { FormSection, FormSectionLeft } from "@/components/Form";
import {
  deleteAccountAction,
  resetAnalyticsAction,
} from "@/utils/actions/user";
import { handleActionResult } from "@/utils/server-action";
import { logOut } from "@/utils/user";

export function DeleteSection() {
  return (
    <FormSection>
      <FormSectionLeft
        title="Delete account"
        description="No longer want to use our service? You can delete your account here. This action is not reversible. All information related to this account will be deleted permanently."
      />

      <div className="flex items-start gap-2 md:col-span-2">
        <Button
          color="white"
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
          color="red"
          onClick={async () => {
            const yes = window.confirm(
              "Are you sure you want to delete your account?",
            );

            if (!yes) return;

            const result = await deleteAccountAction();
            handleActionResult(result, "Account deleted!");
            await logOut("/");
          }}
        >
          Yes, delete my account
        </Button>
      </div>
    </FormSection>
  );
}
