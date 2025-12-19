"use client";

import { useAction } from "next-safe-action/hooks";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toastError, toastSuccess } from "@/components/Toast";
import { linkFastmailAppTokenAction } from "@/utils/actions/fastmail-app-token";
import {
  linkFastmailAppTokenBody,
  type LinkFastmailAppTokenBody,
} from "@/utils/actions/fastmail-app-token.validation";

interface FastmailAppTokenModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FastmailAppTokenModal({
  open,
  onOpenChange,
}: FastmailAppTokenModalProps) {
  const { execute, isExecuting } = useAction(linkFastmailAppTokenAction, {
    onSuccess: () => {
      toastSuccess({ description: "Fastmail account linked successfully!" });
      onOpenChange(false);
      // Reload to show the new account
      window.location.reload();
    },
    onError: (error) => {
      toastError({
        description:
          error.error.serverError || "Failed to link Fastmail account",
      });
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LinkFastmailAppTokenBody>({
    resolver: zodResolver(linkFastmailAppTokenBody),
    defaultValues: { appToken: "" },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Fastmail with App Token</DialogTitle>
          <DialogDescription>
            Enter your Fastmail app token to connect your account. You can
            generate an app token in your Fastmail settings under{" "}
            <span className="font-medium">
              Settings &gt; Privacy & Security &gt; Integrations &gt; API tokens
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(execute)} className="space-y-4">
          <Input
            type="password"
            name="appToken"
            label="App Token"
            placeholder="fmu1-xxxxxxxx-xxxxxxxxxxxxxxxxxxxx"
            registerProps={register("appToken")}
            error={errors.appToken}
          />

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isExecuting}
            >
              Cancel
            </Button>
            <Button type="submit" loading={isExecuting}>
              Connect Account
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
