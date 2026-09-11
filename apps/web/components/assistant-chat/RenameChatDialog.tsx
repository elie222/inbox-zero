"use client";

import { useEffect } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { useAction } from "next-safe-action/hooks";
import { useSWRConfig } from "swr";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/Input";
import { toastError, toastSuccess } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import { renameChatAction } from "@/utils/actions/chat";
import {
  renameChatFormBody,
  type RenameChatFormBody,
} from "@/utils/actions/chat.validation";
import { getActionErrorMessage } from "@/utils/error";

export function RenameChatDialog({
  open,
  onOpenChange,
  chatId,
  currentName,
  defaultLabel,
  onRenamed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: string;
  currentName: string;
  defaultLabel: string;
  onRenamed: () => void;
}) {
  const { emailAccountId } = useAccount();
  const { mutate: globalMutate } = useSWRConfig();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isValid },
  } = useForm<RenameChatFormBody>({
    resolver: zodResolver(renameChatFormBody),
    defaultValues: { name: currentName },
    mode: "onChange",
  });

  useEffect(() => {
    if (open) reset({ name: currentName });
  }, [open, currentName, reset]);

  const { execute, isExecuting } = useAction(
    renameChatAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Chat renamed." });
        onRenamed();
        globalMutate(`/api/chats/${chatId}`);
        onOpenChange(false);
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error, {
            prefix: "Failed to rename chat",
          }),
        });
      },
    },
  );

  const onSubmit: SubmitHandler<RenameChatFormBody> = ({ name }) => {
    execute({ chatId, name });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename chat</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Input
            type="text"
            name="name"
            placeholder={defaultLabel}
            registerProps={register("name")}
            error={errors.name}
          />
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isExecuting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={isExecuting}
              disabled={!isDirty || !isValid}
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
