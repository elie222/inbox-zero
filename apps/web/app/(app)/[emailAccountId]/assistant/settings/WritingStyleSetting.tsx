"use client";

import { useState, useRef } from "react";
import { useForm, Controller } from "react-hook-form";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import { SettingCard } from "@/components/SettingCard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAccount } from "@/providers/EmailAccountProvider";
import { toastError, toastSuccess } from "@/components/Toast";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingContent } from "@/components/LoadingContent";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  type SaveWritingStyleBody,
  saveWritingStyleBody,
} from "@/utils/actions/user.validation";
import { saveWritingStyleAction } from "@/utils/actions/user";
import { Tiptap, type TiptapHandle } from "@/components/editor/Tiptap";
import { getActionErrorMessage } from "@/utils/error";

export function WritingStyleSetting() {
  const { data, isLoading, error } = useEmailAccountFull();

  const hasWritingStyle = !!data?.writingStyle;

  return (
    <SettingCard
      title="Writing style"
      description="Used to draft replies in your voice."
      right={
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="h-8 w-32" />}
        >
          <WritingStyleDialog currentWritingStyle={data?.writingStyle || ""}>
            <Button variant="outline" size="sm">
              {hasWritingStyle ? "Edit" : "Set"}
            </Button>
          </WritingStyleDialog>
        </LoadingContent>
      }
    />
  );
}

function WritingStyleDialog({
  children,
  currentWritingStyle,
}: {
  children: React.ReactNode;
  currentWritingStyle: string;
}) {
  const [open, setOpen] = useState(false);
  const { emailAccountId } = useAccount();
  const { mutate } = useEmailAccountFull();
  const editorRef = useRef<TiptapHandle>(null);

  const {
    control,
    formState: { errors },
    handleSubmit,
  } = useForm<SaveWritingStyleBody>({
    defaultValues: { writingStyle: currentWritingStyle },
    resolver: zodResolver(saveWritingStyleBody),
  });

  const { execute, isExecuting } = useAction(
    saveWritingStyleAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({
          description: "Writing style saved!",
        });
        setOpen(false);
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error),
        });
      },
      onSettled: () => {
        mutate();
      },
    },
  );

  const onSubmit = (data: SaveWritingStyleBody) => {
    execute(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Writing style</DialogTitle>
          <DialogDescription>
            Used to draft replies in your voice.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <Controller
            name="writingStyle"
            control={control}
            render={({ field }) => (
              <div className="max-h-[400px] overflow-y-auto">
                <Tiptap
                  ref={editorRef}
                  initialContent={field.value ?? ""}
                  onChange={field.onChange}
                  output="markdown"
                  className="prose prose-sm dark:prose-invert max-w-none [&_p.is-editor-empty:first-child::before]:pointer-events-none [&_p.is-editor-empty:first-child::before]:float-left [&_p.is-editor-empty:first-child::before]:h-0 [&_p.is-editor-empty:first-child::before]:text-muted-foreground [&_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]"
                  autofocus={false}
                  preservePastedLineBreaks
                  placeholder={`Typical Length: 2-3 sentences

Formality: Informal but professional

Common Greeting: Hey,

Notable Traits:
- Uses contractions frequently
- Concise and direct responses
- Minimal closings`}
                />
              </div>
            )}
          />
          {errors.writingStyle && (
            <p className="mt-1 text-sm text-destructive">
              {errors.writingStyle.message}
            </p>
          )}
          <Button type="submit" className="mt-4" loading={isExecuting}>
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
