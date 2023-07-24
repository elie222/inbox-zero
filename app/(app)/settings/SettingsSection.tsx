"use client";

import { Button } from "@/components/Button";
import {
  FormSection,
  FormSectionLeft,
  SubmitButtonWrapper,
} from "@/components/Form";
import { toastError, toastSuccess } from "@/components/Toast";

export function SettingsSection() {
  return (
    <FormSection>
      <FormSectionLeft
        title="Settings"
        description="Tell us how to use ShareMint with external platforms."
      />

      <form className="flex items-start md:col-span-2">
        <SubmitButtonWrapper>
          <Button>Save</Button>
        </SubmitButtonWrapper>
      </form>
    </FormSection>
  );
}
