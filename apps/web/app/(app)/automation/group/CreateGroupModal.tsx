"use client";

import { useCallback, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { useSWRConfig } from "swr";
import { Modal, useModal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { ButtonLoader } from "@/components/Loading";
import { Input } from "@/components/Input";
import { toastSuccess, toastError } from "@/components/Toast";
import {
  createGroupAction,
  createNewsletterGroupAction,
  createReceiptGroupAction,
} from "@/utils/actions/group";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  type CreateGroupBody,
  createGroupBody,
} from "@/utils/actions/validation";
import { AlertBasic } from "@/components/Alert";
import { isActionError } from "@/utils/error";

export function CreateGroupModalButton(props: {
  existingGroups: string[];
  buttonVariant?: "outline";
}) {
  const { isModalOpen, openModal, closeModal } = useModal();
  const { mutate } = useSWRConfig();

  const showNewsletter = !props.existingGroups.find((g) =>
    g.toLowerCase().includes("newsletter"),
  );
  const showReceipts = !props.existingGroups.find((g) =>
    g.toLowerCase().includes("receipt"),
  );

  const [newsletterLoading, setNewsletterLoading] = useState(false);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const showForm = showCustomForm || (!showNewsletter && !showReceipts);

  return (
    <>
      <Button variant={props.buttonVariant} onClick={openModal}>
        Create group
      </Button>
      <Modal isOpen={isModalOpen} hideModal={closeModal} title="Create Group">
        <div className="mt-4">
          <div className="flex items-center space-x-2">
            {showNewsletter && (
              <Button
                variant="outline"
                disabled={newsletterLoading}
                onClick={async () => {
                  setNewsletterLoading(true);
                  const result = await createNewsletterGroupAction();
                  if (isActionError(result)) {
                    toastError({
                      description: `There was an error creating the group. ${result.error}`,
                    });
                  } else {
                    toastSuccess({ description: `Group created!` });
                    closeModal();
                  }
                  setNewsletterLoading(false);
                  mutate("/api/user/group");
                }}
              >
                {newsletterLoading && <ButtonLoader />}
                Newsletter
              </Button>
            )}
            {showReceipts && (
              <Button
                variant="outline"
                disabled={receiptsLoading}
                onClick={async () => {
                  setReceiptsLoading(true);
                  const result = await createReceiptGroupAction();
                  if (isActionError(result)) {
                    toastError({
                      description: `There was an error creating the group. ${result.error}`,
                    });
                  } else {
                    toastSuccess({ description: `Group created!` });
                    closeModal();
                  }
                  setReceiptsLoading(false);
                  mutate("/api/user/group");
                }}
              >
                {receiptsLoading && <ButtonLoader />}
                Receipt
              </Button>
            )}
            {!showForm && (
              <Button variant="outline" onClick={() => setShowCustomForm(true)}>
                Custom
              </Button>
            )}
          </div>

          {showForm && (
            <div className="mt-4">
              <CreateGroupForm closeModal={closeModal} />
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

function CreateGroupForm({ closeModal }: { closeModal: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateGroupBody>({
    resolver: zodResolver(createGroupBody),
  });
  const { mutate } = useSWRConfig();

  const onSubmit: SubmitHandler<CreateGroupBody> = useCallback(
    async (data) => {
      const result = await createGroupAction(data);

      if (isActionError(result)) {
        toastError({
          description: `There was an error creating the group. ${result.error}`,
        });
      } else {
        toastSuccess({ description: `Group created!` });
        closeModal();
      }

      mutate("/api/user/group");
    },
    [closeModal, mutate],
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* <AlertBasic
        title="AI group creation via prompt coming soon"
        description=""
      /> */}

      <Input
        type="text"
        name="name"
        label="Name"
        placeholder="eg. VIP"
        registerProps={register("name", { required: true })}
        error={errors.name}
      />
      {/* <Input
        disabled
        type="text"
        as="textarea"
        rows={3}
        name="prompt"
        label="Prompt"
        placeholder="eg. Anyone I've done a demo call with."
        explainText="Tell our AI how to populate the group."
        registerProps={register("prompt", { required: true })}
        error={errors.prompt}
      /> */}
      <Button type="submit">
        {isSubmitting && <ButtonLoader />}
        Create
      </Button>
    </form>
  );
}
