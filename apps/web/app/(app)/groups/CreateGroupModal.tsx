"use client";

import { useCallback } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { Modal, useModal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { toastSuccess, toastError } from "@/components/Toast";
import { isErrorMessage } from "@/utils/error";
import { createGroupAction } from "@/utils/actions";
import { zodResolver } from "@hookform/resolvers/zod";
import { CreateGroupBody, createGroupBody } from "@/utils/actions-validation";

export function CreateGroupModalButton() {
  const { isModalOpen, openModal, closeModal } = useModal();

  return (
    <>
      <Button onClick={openModal}>Create group</Button>
      <Modal isOpen={isModalOpen} hideModal={closeModal} title="Create Group">
        <div className="mt-4">
          <CreateGroupForm closeModal={closeModal} />
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

  const onSubmit: SubmitHandler<CreateGroupBody> = useCallback(
    async (data) => {
      const res = await createGroupAction(data);
      if (isErrorMessage(res))
        toastError({ description: `There was an error creating the group.` });
      else {
        toastSuccess({ description: `Group created!` });
        closeModal();
      }
    },
    [closeModal],
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        type="text"
        name="name"
        label="Name"
        placeholder="eg. Newsletter, Receipt, VIP"
        registerProps={register("name", { required: true })}
        error={errors.name}
      />
      <Button type="submit" loading={isSubmitting}>
        Create
      </Button>
    </form>
  );
}
