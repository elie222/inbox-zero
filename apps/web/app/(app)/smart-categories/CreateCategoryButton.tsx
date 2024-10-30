"use client";

import { useCallback } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { Modal, useModal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { toastSuccess, toastError } from "@/components/Toast";
import {
  createCategoryBody,
  type CreateCategoryBody,
} from "@/utils/actions/validation";
import { isActionError } from "@/utils/error";
import { createCategoryAction } from "@/utils/actions/categorize";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function CreateCategoryButton() {
  const { isModalOpen, openModal, closeModal, setIsModalOpen } = useModal();

  return (
    <div>
      <Button onClick={openModal}>
        <PlusIcon className="mr-2 size-4" />
        Create category
      </Button>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Category</DialogTitle>
          </DialogHeader>

          <CreateCategoryForm closeModal={closeModal} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateCategoryForm({ closeModal }: { closeModal: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateCategoryBody>({
    resolver: zodResolver(createCategoryBody),
  });

  const onSubmit: SubmitHandler<CreateCategoryBody> = useCallback(
    async (data) => {
      const result = await createCategoryAction(data);

      if (isActionError(result)) {
        toastError({
          description: `There was an error creating the category. ${result.error}`,
        });
      } else {
        toastSuccess({ description: `Category created!` });
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
        registerProps={register("name", { required: true })}
        error={errors.name}
      />
      <Input
        type="text"
        as="textarea"
        rows={2}
        name="description"
        label="Description (Optional)"
        explainText="Additional information used by the AI to categorize senders"
        registerProps={register("description")}
        error={errors.description}
      />
      <Button type="submit" loading={isSubmitting}>
        Create
      </Button>
    </form>
  );
}
