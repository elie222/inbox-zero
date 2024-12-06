"use client";

import { useCallback, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { useSWRConfig } from "swr";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Modal, useModal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { toastSuccess, toastError } from "@/components/Toast";
import {
  createGroupAction,
  createNewsletterGroupAction,
  createReceiptGroupAction,
} from "@/utils/actions/group";
import {
  type CreateGroupBody,
  createGroupBody,
} from "@/utils/actions/validation";
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
                    toastSuccess({ description: "Group created!" });
                    closeModal();
                  }
                  setNewsletterLoading(false);
                  mutate("/api/user/group");
                }}
                loading={newsletterLoading}
              >
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
                    toastSuccess({ description: "Group created!" });
                    closeModal();
                  }
                  setReceiptsLoading(false);
                  mutate("/api/user/group");
                }}
                loading={receiptsLoading}
              >
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
  const router = useRouter();

  const onSubmit: SubmitHandler<CreateGroupBody> = useCallback(
    async (data) => {
      const result = await createGroupAction(data);

      if (isActionError(result)) {
        toastError({
          description: `There was an error creating the group. ${result.error}`,
        });
      } else {
        toastSuccess({ description: "Group created!" });
        closeModal();
      }

      mutate("/api/user/group");

      router.push(`/automation/group/${result.id}`);
    },
    [closeModal, mutate, router],
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        type="text"
        name="name"
        label="Name"
        placeholder="e.g. Customers, VIP, Web3 Newsletters"
        registerProps={register("name", { required: true })}
        error={errors.name}
      />
      <Input
        type="text"
        autosizeTextarea
        rows={3}
        name="prompt"
        label="AI Prompt (Optional)"
        placeholder="Describe the group members (e.g., 'Customers', or 'Marketing emails')"
        explainText="Our AI will analyze your recent email history and add matching contacts or subjects to this group. If not provided, an empty group will be created."
        registerProps={register("prompt")}
        error={errors.prompt}
      />
      <Button type="submit" loading={isSubmitting}>
        Create
      </Button>
    </form>
  );
}
