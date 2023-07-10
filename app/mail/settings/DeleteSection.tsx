"use client";

import { Button } from "@/components/Button";
import { FormSection, FormSectionLeft } from "@/components/Form";
import { toastError } from "@/components/Toast";

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
          onClick={() => {
            toastError({ description: "TODO" });
          }}
        >
          Yes, delete my account
        </Button>
      </form>
    </FormSection>
  );
}
