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
import { regenerateWritingStyleAction } from "@/utils/actions/assess";
import { Tiptap, type TiptapHandle } from "@/components/editor/Tiptap";
import { getActionErrorMessage } from "@/utils/error";
import { Loader2, Sparkles } from "lucide-react";

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
    setValue,
  } = useForm<SaveWritingStyleBody>({
    defaultValues: { writingStyle: currentWritingStyle },
    resolver: zodResolver(saveWritingStyleBody),
  });

  const { execute: generate, isExecuting: isGenerating } = useAction(
    regenerateWritingStyleAction,
    {
      onSuccess: (data) => {
        const newStyle = data?.data?.writingStyle;

        if (newStyle) {
          setValue("writingStyle", newStyle);
          if (editorRef.current?.editor) {
            editorRef.current.editor.commands.setContent(newStyle);
          }
          toastSuccess({ description: "Writing style regenerated!" });
        }
      },
      onError: () => {
        toastError({ description: "Failed to regenerate style." });
      },
    },
  );

  const { execute, isExecuting } = useAction(
    saveWritingStyleAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Writing style saved!" });
        setOpen(false);
      },
      onError: (error) => {
        toastError({ description: getActionErrorMessage(error.error) });
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
                  className="prose prose-sm dark:prose-invert max-w-none"
                  autofocus={false}
                  preservePastedLineBreaks
                  placeholder="Typical Length: 2-3 sentences..."
                />
              </div>
            )}
          />
          {errors.writingStyle && (
            <p className="mt-1 text-sm text-destructive">
              {errors.writingStyle.message}
            </p>
          )}

          <div className="flex justify-end gap-3 mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={(e) => {
                e.preventDefault();
                generate({ emailAccountId });
              }}
              disabled={isGenerating || isExecuting}
            >
              {isGenerating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {isGenerating ? "Generating..." : "Regenerate Style"}
            </Button>

            <Button type="submit" loading={isExecuting}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
