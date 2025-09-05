"use client";

import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { toastSuccess, toastError } from "@/components/Toast";
import { inviteMemberAction } from "@/utils/actions/invite-member";
import {
  inviteMemberBody,
  type InviteMemberBody,
} from "@/utils/actions/invite-member.validation";

interface InviteMemberModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function InviteMemberModal({
  open,
  onOpenChange,
  onSuccess,
}: InviteMemberModalProps) {
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
      role: "member",
    },
  });

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
          description: result?.data?.message || "Invitation sent successfully!",
        });
        reset();
        onOpenChange(false);
        onSuccess?.();
      }
    },
    [reset, onOpenChange, onSuccess],
  );

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      reset();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
            <label htmlFor="role" className="text-sm font-medium">
              Role
            </label>
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
            <p className="text-xs text-muted-foreground">
              <b>Members</b> can view and collaborate.
              <br />
              <b>Admins</b> can manage the organization and invite others.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Send Invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
