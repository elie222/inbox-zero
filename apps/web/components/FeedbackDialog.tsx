"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useAtom, useSetAtom } from "jotai";
import { type SubmitHandler, useForm } from "react-hook-form";
import { useAction } from "next-safe-action/hooks";
import { zodResolver } from "@hookform/resolvers/zod";
import { MessageSquarePlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/Input";
import { toastError, toastSuccess } from "@/components/Toast";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { submitFeedbackAction } from "@/utils/actions/feedback";
import {
  submitFeedbackBody,
  type SubmitFeedbackBody,
} from "@/utils/actions/feedback.validation";
import { getActionErrorMessage } from "@/utils/error";
import { feedbackDialogOpenAtom } from "@/store/command-palette";

export function FeedbackSidebarButton() {
  const { t } = useLingui();
  const setOpen = useSetAtom(feedbackDialogOpenAtom);

  return (
    <SidebarMenuButton
      tooltip={t`Feedback`}
      sidebarName="left-sidebar"
      className="h-9 font-semibold"
      aria-haspopup="dialog"
      onClick={() => setOpen(true)}
    >
      <MessageSquarePlusIcon />
      <span>
        <Trans>Feedback</Trans>
      </span>
    </SidebarMenuButton>
  );
}

export function FeedbackDialog() {
  const { t } = useLingui();
  const [open, setOpen] = useAtom(feedbackDialogOpenAtom);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SubmitFeedbackBody>({
    resolver: zodResolver(submitFeedbackBody),
    defaultValues: { feedback: "" },
  });

  const { execute, isExecuting } = useAction(submitFeedbackAction, {
    onSuccess: () => {
      toastSuccess({ description: t`Thanks for your feedback!` });
      reset();
      setOpen(false);
    },
    onError: (error) => {
      toastError({
        description: getActionErrorMessage(error.error, {
          prefix: t`Failed to submit feedback`,
        }),
      });
    },
  });

  const onSubmit: SubmitHandler<SubmitFeedbackBody> = (data) => {
    execute(data);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Send feedback</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Tell us what you like, what is confusing, or what you want us to
              build next.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <Input
            type="text"
            name="feedback"
            autosizeTextarea
            rows={5}
            placeholder={t`What's on your mind?`}
            registerProps={register("feedback")}
            error={errors.feedback}
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isExecuting}
            >
              <Trans>Cancel</Trans>
            </Button>
            <Button type="submit" loading={isExecuting}>
              <Trans>Submit</Trans>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
