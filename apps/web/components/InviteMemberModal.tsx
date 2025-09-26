"use client";

import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/Input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TooltipExplanation } from "@/components/TooltipExplanation";
import { toastSuccess, toastError } from "@/components/Toast";
import { inviteMemberAction } from "@/utils/actions/invite-member";
import {
  inviteMemberBody,
  type InviteMemberBody,
} from "@/utils/actions/invite-member.validation";
import { useDialogState } from "@/hooks/useDialogState";

export function InviteMemberModal({
  organizationId,
}: {
  organizationId: string;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setValue,
    watch,
  } = useForm<InviteMemberBody>({
    resolver: zodResolver(inviteMemberBody),
    defaultValues: {
      organizationId,
      role: "member",
    },
  });

  const { isOpen, onToggle, onClose } = useDialogState();

  const selectedRole = watch("role");

  const onSubmit: SubmitHandler<InviteMemberBody> = useCallback(
    async (data) => {
      const result = await inviteMemberAction(data);

      if (result?.serverError) {
        toastError({
          title: "Error sending invitation",
          description: result.serverError,
        });
      } else {
        toastSuccess({
          description: "Invitation sent successfully!",
        });
        reset();
        onClose();
      }
    },
    [reset, onClose],
  );

  return (
    <Dialog open={isOpen} onOpenChange={onToggle}>
      <DialogTrigger asChild>
        <Button>Invite Member</Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Member</DialogTitle>
          <DialogDescription>
            Send an invitation to join your organization. The recipient will
            receive an email with instructions.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            type="email"
            name="email"
            label="Email Address"
            placeholder="john.doe@example.com"
            registerProps={register("email")}
            error={errors.email}
          />

          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <label htmlFor="role" className="text-sm font-medium">
                Role
              </label>
              <TooltipExplanation
                side="right"
                text="Members can view and collaborate.\nAdmins can manage the organization and invite others."
              />
            </div>
            <Select
              value={selectedRole}
              onValueChange={(value) =>
                setValue("role", value as "admin" | "member")
              }
            >
              <SelectTrigger id="role">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit" loading={isSubmitting}>
              Send Invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
