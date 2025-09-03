"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import { useCallback } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { Input } from "@/components/Input";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAccount } from "@/providers/EmailAccountProvider";
import { registerSSOProviderAction } from "@/utils/actions/enterprise";
import {
  type SsoRegistrationBody,
  ssoRegistrationBody,
} from "@/utils/actions/enterprise.validation";

interface EnterpriseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function EnterpriseModal({ isOpen, onClose }: EnterpriseModalProps) {
  const { emailAccount } = useAccount();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<SsoRegistrationBody>({
    resolver: zodResolver(ssoRegistrationBody),
  });

  const { executeAsync: executeRegisterSSO, isExecuting } = useAction(
    registerSSOProviderAction.bind(null, emailAccount?.id || ""),
  );

  const onSubmit: SubmitHandler<SsoRegistrationBody> = useCallback(
    async (data) => {
      if (!emailAccount?.id) {
        toastError({ title: "Error", description: "Email account not found" });
        return;
      }

      const result = await executeRegisterSSO(data);

      if (result?.serverError) {
        toastError({
          title: "Error registering SSO",
          description: result.serverError,
        });
      } else {
        toastSuccess({
          description: "SSO registration initiated successfully!",
        });
        reset();
        onClose();
      }
    },
    [emailAccount?.id, executeRegisterSSO, reset, onClose],
  );

  const handleClose = useCallback(() => {
    if (!isExecuting) {
      reset();
      onClose();
    }
  }, [isExecuting, reset, onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Enterprise SSO Registration</DialogTitle>
          <DialogDescription>
            Configure Single Sign-On (SSO) for your organization. This will
            enable your team to sign in using your identity provider.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 gap-4">
            <Input
              type="text"
              name="organizationName"
              label="Organization Name"
              placeholder="Enter your organization name"
              registerProps={register("organizationName")}
              error={errors.organizationName}
            />

            <Input
              type="text"
              name="providerId"
              label="Provider ID"
              placeholder="e.g., inboxzero-google"
              registerProps={register("providerId")}
              error={errors.providerId}
            />

            <Input
              type="text"
              name="domain"
              label="Domain"
              placeholder="e.g., getinboxzero.com"
              registerProps={register("domain")}
              error={errors.domain}
            />

            <div className="space-y-2">
              <label htmlFor="idpMetadata" className="text-sm font-medium">
                IDP Metadata (XML)
              </label>
              <Textarea
                id="idpMetadata"
                {...register("idpMetadata")}
                placeholder="Paste your SAML IDP metadata XML here..."
                className="min-h-[200px] font-mono text-xs"
              />
              {errors.idpMetadata && (
                <div className="mt-0.5 text-sm font-semibold leading-snug text-red-400">
                  {errors.idpMetadata.message}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isExecuting}
            >
              Cancel
            </Button>
            <Button type="submit" loading={isExecuting}>
              Register SSO
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
