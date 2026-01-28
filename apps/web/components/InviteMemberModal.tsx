"use client";

import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useState } from "react";
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
import { TagInput } from "@/components/TagInput";
import {
  inviteMemberAction,
  createOrganizationAndInviteAction,
} from "@/utils/actions/organization";
import {
  inviteMemberBody,
  type InviteMemberBody,
} from "@/utils/actions/organization.validation";
import { useDialogState } from "@/hooks/useDialogState";
import { useAccount } from "@/providers/EmailAccountProvider";
import { isValidEmail } from "@/utils/email";

export function InviteMemberModal({
  organizationId,
  onSuccess,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  trigger,
}: {
  organizationId?: string;
  onSuccess?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}) {
  const internalState = useDialogState();

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalState.isOpen;
  const onOpenChange = isControlled
    ? controlledOnOpenChange
    : internalState.onToggle;
  const onClose = isControlled
    ? () => controlledOnOpenChange?.(false)
    : internalState.onClose;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {trigger !== null &&
        (trigger ?? (
          <DialogTrigger asChild>
            <Button size="sm">Invite Member</Button>
          </DialogTrigger>
        ))}

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {organizationId ? "Invite Member" : "Invite Members"}
          </DialogTitle>
          <DialogDescription>
            {organizationId
              ? "Send an invitation to join your organization. The recipient will receive an email with instructions."
              : "Enter email addresses to invite team members. This will create a new organization for your team."}
          </DialogDescription>
        </DialogHeader>

        {organizationId ? (
          <InviteForm
            organizationId={organizationId}
            onClose={onClose}
            onSuccess={onSuccess}
          />
        ) : (
          <CreateOrgAndInviteForm onClose={onClose} onSuccess={onSuccess} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function InviteForm({
  organizationId,
  onClose,
  onSuccess,
}: {
  organizationId: string;
  onClose: () => void;
  onSuccess?: () => void;
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
        onSuccess?.();
      }
    },
    [reset, onClose, onSuccess],
  );

  return (
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
  );
}

function CreateOrgAndInviteForm({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const { emailAccountId } = useAccount();
  const [emails, setEmails] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleEmailsChange = useCallback((newEmails: string[]) => {
    setEmails(newEmails.map((e) => e.toLowerCase()));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (emails.length === 0) {
      toastError({ description: "Please enter at least one email address" });
      return;
    }

    setIsSubmitting(true);

    const result = await createOrganizationAndInviteAction(emailAccountId, {
      emails,
    });

    setIsSubmitting(false);

    if (result?.serverError) {
      toastError({
        description: "Failed to create organization and send invitations",
      });
    } else if (result?.data) {
      const successCount = result.data.results.filter((r) => r.success).length;
      const errorCount = result.data.results.filter((r) => !r.success).length;

      if (successCount > 0) {
        toastSuccess({
          description: `${successCount} invitation${successCount > 1 ? "s" : ""} sent successfully!`,
        });
      }
      if (errorCount > 0) {
        toastError({
          description: `Failed to send ${errorCount} invitation${errorCount > 1 ? "s" : ""}`,
        });
      }

      setEmails([]);
      onClose();
      onSuccess?.();
    }
  }, [emails, emailAccountId, onClose, onSuccess]);

  return (
    <div className="space-y-4">
      <TagInput
        value={emails}
        onChange={handleEmailsChange}
        validate={(email) =>
          isValidEmail(email) ? null : "Please enter a valid email address"
        }
        label="Email addresses"
        id="email-input"
        placeholder="Enter email addresses separated by commas"
      />

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button
          type="button"
          onClick={handleSubmit}
          loading={isSubmitting}
          disabled={emails.length === 0}
        >
          Send Invitation{emails.length > 1 ? "s" : ""}
        </Button>
      </DialogFooter>
    </div>
  );
}
