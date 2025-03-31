"use client";

import type { KeyedMutator } from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createKnowledgeBody,
  type CreateKnowledgeBody,
  updateKnowledgeBody,
  type UpdateKnowledgeBody,
} from "@/utils/actions/knowledge.validation";
import {
  createKnowledgeAction,
  updateKnowledgeAction,
} from "@/utils/actions/knowledge";
import { toastError, toastSuccess } from "@/components/Toast";
import { isActionError } from "@/utils/error";
import type { GetKnowledgeResponse } from "@/app/api/knowledge/route";
import type { Knowledge } from "@prisma/client";

export function KnowledgeForm({
  closeDialog,
  refetch,
  editingItem,
}: {
  closeDialog: () => void;
  refetch: KeyedMutator<GetKnowledgeResponse>;
  editingItem: Knowledge | null;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateKnowledgeBody | UpdateKnowledgeBody>({
    resolver: zodResolver(
      editingItem ? updateKnowledgeBody : createKnowledgeBody,
    ),
    defaultValues: editingItem
      ? {
          id: editingItem.id,
          title: editingItem.title,
          content: editingItem.content,
        }
      : undefined,
  });

  const onSubmit = async (data: CreateKnowledgeBody | UpdateKnowledgeBody) => {
    const result = editingItem
      ? await updateKnowledgeAction(data as UpdateKnowledgeBody)
      : await createKnowledgeAction(data as CreateKnowledgeBody);

    if (isActionError(result)) {
      toastError({
        title: `Error ${editingItem ? "updating" : "creating"} knowledge base entry`,
        description: result.error,
      });
      return;
    }

    toastSuccess({
      description: `Knowledge base entry ${editingItem ? "updated" : "created"} successfully`,
    });

    refetch();
    closeDialog();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        type="text"
        name="title"
        label="Title"
        registerProps={register("title")}
        error={errors.title}
      />
      <Input
        type="text"
        name="content"
        label="Content"
        autosizeTextarea
        rows={5}
        registerProps={register("content")}
        error={errors.content}
      />
      <Button type="submit" loading={isSubmitting}>
        {editingItem ? "Update" : "Create"}
      </Button>
    </form>
  );
}
