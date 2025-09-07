"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import { useCallback } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { ErrorMessage, Input, Label } from "@/components/Input";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
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
import TextareaAutosize from "react-textarea-autosize";
import { registerSSOProviderAction } from "@/utils/actions/sso";
import {
  type SsoRegistrationBody,
  ssoRegistrationBody,
} from "@/utils/actions/sso.validation";
import { useDialogState } from "@/hooks/useDialogState";

export function RegisterSSOModal() {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<SsoRegistrationBody>({
    resolver: zodResolver(ssoRegistrationBody),
  });

  const { isOpen, onToggle, onClose } = useDialogState();

  const { executeAsync: executeRegisterSSO, isExecuting } = useAction(
    registerSSOProviderAction,
  );

  const onSubmit: SubmitHandler<SsoRegistrationBody> = useCallback(
    async (data) => {
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
    [executeRegisterSSO, reset, onClose],
  );

  return (
    <Dialog open={isOpen} onOpenChange={onToggle}>
      <DialogTrigger asChild>
        <Button>Register SSO Provider</Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Enterprise SSO Registration (SAML)</DialogTitle>
          <DialogDescription>
            Configure Single Sign-On (SAML) for your organization. This will
            enable your team to sign in using your SAML identity provider.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 gap-4">
            <Input
              type="text"
              name="organizationName"
              label="Organization Name"
              placeholder="e.g., Your Company"
              registerProps={register("organizationName")}
              error={errors.organizationName}
            />

            <Input
              type="text"
              name="providerId"
              label="Provider ID"
              placeholder="e.g., your-company-saml"
              registerProps={register("providerId")}
              error={errors.providerId}
            />

            <Input
              type="text"
              name="domain"
              label="Domain"
              placeholder="e.g., your-company.com"
              registerProps={register("domain")}
              error={errors.domain}
            />

            <div className="space-y-2">
              <Label name="idpMetadata" label="IDP Metadata (XML)" />
              <TextareaAutosize
                id="idpMetadata"
                className="block w-full flex-1 whitespace-pre-wrap rounded-md border border-border bg-background shadow-sm focus:border-black focus:ring-black sm:text-sm"
                minRows={3}
                rows={3}
                {...register("idpMetadata")}
                placeholder="Paste your SAML IDP metadata XML from your identity provider here."
              />
              {errors.idpMetadata && (
                <ErrorMessage message={errors.idpMetadata.message ?? ""} />
              )}
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit" loading={isExecuting}>
              Register SSO
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
