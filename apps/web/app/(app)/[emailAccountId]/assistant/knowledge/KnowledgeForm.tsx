"use client";

import { useRef } from "react";
import type { KeyedMutator } from "swr";
import { CrownIcon } from "lucide-react";
import Link from "next/link";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { useForm, Controller } from "react-hook-form";
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
import type { GetKnowledgeResponse } from "@/app/api/knowledge/route";
import type { Knowledge } from "@/generated/prisma/client";
import { Tiptap, type TiptapHandle } from "@/components/editor/Tiptap";
import { Label } from "@/components/ui/label";
import { cn } from "@/utils";
import { useAccount } from "@/providers/EmailAccountProvider";
import { usePremium } from "@/hooks/usePremium";
import { hasTierAccess } from "@/utils/premium";
import { AlertWithButton } from "@/components/Alert";
import { KNOWLEDGE_BASIC_MAX_ITEMS } from "@/utils/config";

export function KnowledgeForm({
  closeDialog,
  refetch,
  editingItem,
  knowledgeItemsCount,
}: {
  closeDialog: () => void;
  refetch: KeyedMutator<GetKnowledgeResponse>;
  editingItem: Knowledge | null;
  knowledgeItemsCount: number;
}) {
  const { emailAccountId } = useAccount();
  const { t } = useLingui();
  const { tier } = usePremium();

  const hasFullAccess = hasTierAccess({
    tier: tier || null,
    minimumTier: "PLUS_MONTHLY",
  });

  const {
    register,
    handleSubmit,
    control,
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
      : {
          title: t`How to draft replies`,
          content: "",
        },
  });

  const editorRef = useRef<TiptapHandle>(null);

  const onSubmit = async (data: CreateKnowledgeBody | UpdateKnowledgeBody) => {
    const markdownContent = editorRef.current?.getMarkdown();

    const submitData = {
      ...data,
      content: markdownContent ?? "",
    };

    const result = editingItem
      ? await updateKnowledgeAction(
          emailAccountId,
          submitData as UpdateKnowledgeBody,
        )
      : await createKnowledgeAction(emailAccountId, submitData);

    if (result?.serverError) {
      toastError({
        title: editingItem
          ? t`Error updating knowledge base entry`
          : t`Error creating knowledge base entry`,
        description: result.serverError || "",
      });
      return;
    }

    toastSuccess({
      description: editingItem
        ? t`Knowledge base entry updated successfully`
        : t`Knowledge base entry created successfully`,
    });

    refetch();
    closeDialog();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {!editingItem &&
        !hasFullAccess &&
        knowledgeItemsCount >= KNOWLEDGE_BASIC_MAX_ITEMS && (
          <AlertWithButton
            title={t`Upgrade to add more knowledge base entries`}
            description={
              <Trans>
                Switch to the Plus plan to add more knowledge base entries.
              </Trans>
            }
            icon={<CrownIcon className="h-4 w-4" />}
            button={
              <Button asChild>
                <Link href="/premium">
                  <Trans>Upgrade</Trans>
                </Link>
              </Button>
            }
            variant="blue"
          />
        )}

      <Input
        type="text"
        name="title"
        label={t`Title`}
        registerProps={register("title")}
        error={errors.title}
      />
      <div>
        <Label
          htmlFor="content"
          className={cn(errors.content && "text-destructive")}
        >
          <Trans>Content (supports markdown)</Trans>
        </Label>
        <Controller
          name="content"
          control={control}
          render={({ field }) => (
            <div className="max-h-[600px] overflow-y-auto">
              <Tiptap
                ref={editorRef}
                initialContent={field.value ?? ""}
                input="markdown"
                className="mt-1 prose prose-sm dark:prose-invert max-w-none"
                autofocus={false}
              />
            </div>
          )}
        />
        {errors.content && (
          <p className="mt-1 text-sm text-destructive">
            {errors.content.message}
          </p>
        )}
      </div>
      <Button type="submit" loading={isSubmitting}>
        {editingItem ? <Trans>Update</Trans> : <Trans>Create</Trans>}
      </Button>
    </form>
  );
}
