"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
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

  const {
    register,
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
          description:
            error.error.serverError ??
            "An unknown error occurred while saving your writing style",
        });
      },
      onSettled: () => {
        mutate();
      },
    },
  );

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

        <form onSubmit={handleSubmit(execute)}>
          <Input
            type="text"
            autosizeTextarea
            rows={8}
            name="writingStyle"
            label=""
            registerProps={register("writingStyle")}
            error={errors.writingStyle}
            placeholder="Typical Length: 2-3 sentences
Formality: Informal but professional
Common Greeting: Hey,
Notable Traits:
- Uses contractions frequently
- Concise and direct responses
- Minimal closings"
          />
          <Button type="submit" className="mt-8" loading={isExecuting}>
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
