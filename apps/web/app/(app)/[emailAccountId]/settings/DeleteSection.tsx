"use client";

import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormSection, FormSectionLeft } from "@/components/Form";
import { deleteAccountAction } from "@/utils/actions/user";
import { logOut } from "@/utils/user";
import { useStatLoader } from "@/providers/StatLoaderProvider";

export function DeleteSection() {
  const { onCancelLoadBatch } = useStatLoader();

  const { executeAsync: executeDeleteAccount } = useAction(
    deleteAccountAction.bind(null),
  );

  return (
    <FormSection>
      <FormSectionLeft
        title="Delete account"
        description="No longer want to use our service? You can delete your account here. This action is not reversible. All information related to this account will be deleted permanently."
      />

      <div>
        <Button
          variant="outline"
          onClick={async () => {
            onCancelLoadBatch();
            const yes = window.confirm(
              "Are you sure you want to delete your user and all associated accounts?",
            );

            if (!yes) return;

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
          }}
        >
          Delete user
        </Button>
      </div>
    </FormSection>
  );
}
