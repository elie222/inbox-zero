"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { toastError, toastSuccess } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  createSnippetAction,
  updateSnippetAction,
} from "@/utils/actions/snippet";
import {
  createSnippetBody,
  updateSnippetBody,
  type CreateSnippetBody,
  type UpdateSnippetBody,
} from "@/utils/actions/snippet.validation";
import type { GetSnippetsResponse } from "@/app/api/user/snippets/route";

type SnippetFormItem = GetSnippetsResponse["snippets"][number];

export function SnippetForm({
  closeDialog,
  editingItem,
  initialValues,
  onCreated,
  refetch,
}: {
  closeDialog: () => void;
  editingItem?: SnippetFormItem | null;
  initialValues?: Partial<CreateSnippetBody>;
  onCreated?: (snippet: SnippetFormItem) => void;
  refetch: () => void;
}) {
  const { emailAccountId } = useAccount();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateSnippetBody | UpdateSnippetBody>({
    resolver: zodResolver(editingItem ? updateSnippetBody : createSnippetBody),
    defaultValues: editingItem
      ? {
          content: editingItem.content,
          id: editingItem.id,
          name: editingItem.name,
          shortcut: editingItem.shortcut,
        }
      : {
          content: initialValues?.content ?? "",
          name: initialValues?.name ?? "",
          shortcut: initialValues?.shortcut ?? "",
        },
  });

  useEffect(() => {
    if (editingItem) {
      reset({
        content: editingItem.content,
        id: editingItem.id,
        name: editingItem.name,
        shortcut: editingItem.shortcut,
      });
      return;
    }
    reset({
      content: initialValues?.content ?? "",
      name: initialValues?.name ?? "",
      shortcut: initialValues?.shortcut ?? "",
    });
  }, [editingItem, initialValues, reset]);

  const onSubmit = async (data: CreateSnippetBody | UpdateSnippetBody) => {
    const result = editingItem
      ? await updateSnippetAction(emailAccountId, data as UpdateSnippetBody)
      : await createSnippetAction(emailAccountId, data);

    if (result?.serverError) {
      toastError({
        title: `Error ${editingItem ? "updating" : "creating"} snippet`,
        description: result.serverError,
      });
      return;
    }

    toastSuccess({
      description: `Snippet ${editingItem ? "updated" : "created"}`,
    });
    if (!editingItem && result?.data?.snippet) {
      onCreated?.(result.data.snippet);
    }
    refetch();
    closeDialog();
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <Input
        error={errors.name}
        label="Name"
        name="name"
        registerProps={register("name")}
        type="text"
      />
      <Input
        error={errors.shortcut}
        explainText="Type / then this shortcut in a draft to insert the snippet."
        label="Shortcut"
        leftText="/"
        name="shortcut"
        registerProps={register("shortcut")}
        type="text"
      />
      <Input
        autosizeTextarea
        error={errors.content}
        explainText="Use {first_name}, {name}, or {email} to fill in the first recipient."
        label="Content"
        name="content"
        registerProps={register("content")}
        rows={6}
        type="text"
      />
      <Button loading={isSubmitting} type="submit">
        {editingItem ? "Update" : "Save snippet"}
      </Button>
    </form>
  );
}
