"use client";

import { useState } from "react";
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
  DialogTrigger,
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

export function FeedbackDialog() {
  const [open, setOpen] = useState(false);

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
      toastSuccess({ description: "Thanks for your feedback!" });
      reset();
      setOpen(false);
    },
    onError: (error) => {
      toastError({
        description: getActionErrorMessage(error.error, {
          prefix: "Failed to submit feedback",
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
      <DialogTrigger asChild>
        <SidebarMenuButton
          tooltip="Feedback"
          sidebarName="left-sidebar"
          className="h-9 font-semibold"
        >
          <MessageSquarePlusIcon />
          <span>Feedback</span>
        </SidebarMenuButton>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>
            Tell us what you like, what is confusing, or what you want us to
            build next.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <Input
            type="text"
            name="feedback"
            autosizeTextarea
            rows={5}
            placeholder="What's on your mind?"
            registerProps={register("feedback")}
            error={errors.feedback}
          />
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isExecuting}
            >
              Cancel
            </Button>
            <Button type="submit" loading={isExecuting}>
              Submit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
