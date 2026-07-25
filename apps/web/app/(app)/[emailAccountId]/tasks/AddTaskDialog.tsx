"use client";

import { useForm } from "react-hook-form";
import { useAction } from "next-safe-action/hooks";
import { createTaskAction } from "@/utils/actions/task";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getActionErrorMessage } from "@/utils/error";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function AddTaskDialog({
  open,
  onClose,
  mutate,
}: {
  open: boolean;
  onClose: () => void;
  mutate: () => void;
}) {
  const { emailAccountId } = useAccount();
  const { register, handleSubmit, reset } = useForm<{
    title: string;
    description: string;
    assigneeEmail: string;
    dueAt: string;
  }>();

  const create = useAction(createTaskAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Task added" });
      mutate();
      closeAndReset();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  // The dialog stays mounted, so its form state survives a close; clear it on
  // every close path (cancel, Escape, outside-click) to avoid a stale draft
  const closeAndReset = () => {
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeAndReset()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add task</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={handleSubmit((values) =>
            create.execute({
              title: values.title,
              description: values.description,
              assigneeEmail: values.assigneeEmail,
              dueAt: values.dueAt ? new Date(values.dueAt).toISOString() : null,
            }),
          )}
        >
          <div>
            <Label htmlFor="new-task-title">Title</Label>
            <Input
              id="new-task-title"
              className="mt-2"
              autoFocus
              placeholder="What needs to happen?"
              {...register("title", { required: true })}
            />
          </div>
          <div>
            <Label htmlFor="new-task-description">Description</Label>
            <Textarea
              id="new-task-description"
              className="mt-2"
              rows={3}
              {...register("description")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="new-task-assignee">Assignee email</Label>
              <Input
                id="new-task-assignee"
                type="email"
                className="mt-2"
                placeholder="who@company.com"
                {...register("assigneeEmail")}
              />
            </div>
            <div>
              <Label htmlFor="new-task-due">Due</Label>
              <Input
                id="new-task-due"
                type="datetime-local"
                className="mt-2"
                {...register("dueAt")}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closeAndReset}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isExecuting}>
              Add task
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
