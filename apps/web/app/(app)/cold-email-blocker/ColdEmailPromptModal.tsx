import { useCallback } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PenIcon } from "lucide-react";
import { Modal, useModal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import {
  UpdateColdEmailSettingsBody,
  updateColdEmailSettingsBody,
} from "@/app/api/user/settings/cold-email/validation";
import { SaveEmailUpdateSettingsResponse } from "@/app/api/user/settings/email-updates/route";
import { postRequest } from "@/utils/api";
import { DEFAULT_COLD_EMAIL_PROMPT } from "@/app/api/ai/cold-email/prompt";
import { toastError, toastSuccess } from "@/components/Toast";
import { isErrorMessage } from "@/utils/error";

export function ColdEmailPromptModal(props: {
  coldEmailPrompt?: string | null;
}) {
  const { isModalOpen, openModal, closeModal } = useModal();

  return (
    <>
      <Button onClick={openModal} type="button" color="white">
        <PenIcon className="mr-2 h-4 w-4" />
        Edit Prompt
      </Button>
      <Modal
        isOpen={isModalOpen}
        hideModal={closeModal}
        title="Edit Cold Email Prompt"
      >
        <ColdEmailPromptForm
          coldEmailPrompt={props.coldEmailPrompt}
          closeModal={closeModal}
        />
      </Modal>
    </>
  );
}

function ColdEmailPromptForm(props: {
  coldEmailPrompt?: string | null;
  closeModal: () => void;
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

  const { closeModal } = props;

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
        toastError({ description: `Error updating cold email prompt.` });
      } else {
        toastSuccess({ description: `Prompt updated!` });
        closeModal();
      }
    },
    [closeModal],
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-2">
      <Input
        type="text"
        as="textarea"
        rows={20}
        name="coldEmailPrompt"
        label="Prompt to classify cold emails."
        registerProps={register("coldEmailPrompt")}
        error={errors.coldEmailPrompt}
        explainText=" The default prompt we use is shown above if none set. Use a similar style for best results. Delete your prompt to revert to the default prompt."
      />

      <div className="mt-2">
        <Button type="submit" size="lg" loading={isSubmitting}>
          Save
        </Button>
      </div>
    </form>
  );
}
