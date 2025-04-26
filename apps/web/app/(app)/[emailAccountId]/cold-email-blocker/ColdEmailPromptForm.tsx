import { useCallback } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import {
  updateColdEmailPromptBody,
  type UpdateColdEmailPromptBody,
} from "@/utils/actions/cold-email.validation";
import { DEFAULT_COLD_EMAIL_PROMPT } from "@/utils/cold-email/prompt";
import { toastError, toastSuccess } from "@/components/Toast";
import { updateColdEmailPromptAction } from "@/utils/actions/cold-email";
import { useAccount } from "@/providers/EmailAccountProvider";
export function ColdEmailPromptForm(props: {
  coldEmailPrompt?: string | null;
  onSuccess: () => void;
}) {
  const { emailAccountId } = useAccount();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateColdEmailPromptBody>({
    resolver: zodResolver(updateColdEmailPromptBody),
    defaultValues: {
      coldEmailPrompt: props.coldEmailPrompt || DEFAULT_COLD_EMAIL_PROMPT,
    },
  });

  const { onSuccess } = props;

  const onSubmit: SubmitHandler<UpdateColdEmailPromptBody> = useCallback(
    async (data) => {
      const result = await updateColdEmailPromptAction(emailAccountId, {
        // if user hasn't changed the prompt, unset their custom prompt
        coldEmailPrompt:
          !data.coldEmailPrompt ||
          data.coldEmailPrompt === DEFAULT_COLD_EMAIL_PROMPT
            ? null
            : data.coldEmailPrompt,
      });

      if (result?.serverError) {
        toastError({ description: "Error updating cold email prompt." });
      } else {
        toastSuccess({ description: "Prompt updated!" });
        onSuccess();
      }
    },
    [onSuccess, emailAccountId],
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Input
        type="text"
        autosizeTextarea
        rows={10}
        name="coldEmailPrompt"
        label="How to classify cold emails"
        registerProps={register("coldEmailPrompt")}
        error={errors.coldEmailPrompt}
        explainText="Use a similar style to the example prompt for best results. Delete your prompt to revert to the default prompt."
      />

      <div className="mt-2">
        <Button type="submit" loading={isSubmitting}>
          Save
        </Button>
      </div>
    </form>
  );
}
