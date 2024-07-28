"use client";

import { Button } from "@/components/Button";
import { FormSection, FormSectionLeft } from "@/components/Form";
import { deleteAccountAction } from "@/utils/actions/user";
import { handleActionResult } from "@/utils/server-action";
import { logOut } from "@/utils/user";

export function DeleteSection() {
  return (
    <FormSection>
      <FormSectionLeft
        title="Delete account"
        description="No longer want to use our service? You can delete your account here. This action is not reversible. All information related to this account will be deleted permanently."
      />

      <form className="flex items-start md:col-span-2">
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
      </form>
    </FormSection>
  );
}
