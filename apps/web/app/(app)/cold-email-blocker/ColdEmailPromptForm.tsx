import { useCallback } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import {
  type UpdateColdEmailSettingsBody,
  updateColdEmailSettingsBody,
} from "@/app/api/user/settings/cold-email/validation";
import type { SaveEmailUpdateSettingsResponse } from "@/app/api/user/settings/email-updates/route";
import { postRequest } from "@/utils/api";
import { DEFAULT_COLD_EMAIL_PROMPT } from "@/utils/cold-email/prompt";
import { toastError, toastSuccess } from "@/components/Toast";
import { isErrorMessage } from "@/utils/error";

export function ColdEmailPromptForm(props: {
  coldEmailPrompt?: string | null;
  onSuccess: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateColdEmailSettingsBody>({
    resolver: zodResolver(updateColdEmailSettingsBody),
    defaultValues: {
      coldEmailPrompt: props.coldEmailPrompt || DEFAULT_COLD_EMAIL_PROMPT,
    },
  });

  const { onSuccess } = props;

  const onSubmit: SubmitHandler<UpdateColdEmailSettingsBody> = useCallback(
    async (data) => {
      const res = await postRequest<
        SaveEmailUpdateSettingsResponse,
        UpdateColdEmailSettingsBody
      >("/api/user/settings/cold-email", {
        // if user hasn't changed the prompt, unset their custom prompt
        coldEmailPrompt:
          !data.coldEmailPrompt ||
          data.coldEmailPrompt === DEFAULT_COLD_EMAIL_PROMPT
            ? null
            : data.coldEmailPrompt,
      });

      if (isErrorMessage(res)) {
        toastError({ description: "Error updating cold email prompt." });
      } else {
        toastSuccess({ description: "Prompt updated!" });
        onSuccess();
      }
    },
    [onSuccess],
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Input
        type="text"
        autosizeTextarea
        rows={10}
        name="coldEmailPrompt"
        label="Prompt to classify cold emails"
        registerProps={register("coldEmailPrompt")}
        error={errors.coldEmailPrompt}
        explainText="Adjust to your needs.Use a similar style for best results. Delete your prompt to revert to the default prompt."
      />

      <div className="mt-2">
        <Button type="submit" loading={isSubmitting}>
          Save
        </Button>
      </div>
    </form>
  );
}
