"use client";

import { useRef } from "react";
import type { KeyedMutator } from "swr";
import { CrownIcon } from "lucide-react";
import Link from "next/link";
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
import { PremiumTier, type Knowledge } from "@prisma/client";
import { Tiptap, type TiptapHandle } from "@/components/editor/Tiptap";
import { Label } from "@/components/ui/label";
import { cn } from "@/utils";
import { useAccount } from "@/providers/EmailAccountProvider";
import { usePremium } from "@/components/PremiumAlert";
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
  const { tier } = usePremium();

  const hasFullAccess = hasTierAccess({
    tier: tier || null,
    minimumTier: PremiumTier.BUSINESS_PLUS_MONTHLY,
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
          title: "How to draft replies",
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
        title: `Error ${editingItem ? "updating" : "creating"} knowledge base entry`,
        description: result.serverError || "",
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
      {!editingItem &&
        !hasFullAccess &&
        knowledgeItemsCount >= KNOWLEDGE_BASIC_MAX_ITEMS && (
          <AlertWithButton
            title="Upgrade to add more knowledge base entries"
            description={
              <>
                Switch to the Business plan to add more knowledge base entries.
              </>
            }
            icon={<CrownIcon className="h-4 w-4" />}
            button={
              <Button asChild>
                <Link href="/premium">Upgrade</Link>
              </Button>
            }
            variant="blue"
          />
        )}

      <Input
        type="text"
        name="title"
        label="Title"
        registerProps={register("title")}
        error={errors.title}
      />
      <div>
        <Label
          htmlFor="content"
          className={cn(errors.content && "text-destructive")}
        >
          Content (supports markdown)
        </Label>
        <Controller
          name="content"
          control={control}
          render={({ field }) => (
            <div className="max-h-[600px] overflow-y-auto">
              <Tiptap
                ref={editorRef}
                initialContent={field.value ?? ""}
                className="mt-1"
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
        {editingItem ? "Update" : "Create"}
      </Button>
    </form>
  );
}
