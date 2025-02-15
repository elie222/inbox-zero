"use client";

import { useCallback, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { isActionError } from "@/utils/error";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createApiKeyBody,
  type CreateApiKeyBody,
} from "@/utils/actions/validation";
import {
  createApiKeyAction,
  deactivateApiKeyAction,
} from "@/utils/actions/api-key";
import { handleActionResult } from "@/utils/server-action";
import { toastError } from "@/components/Toast";
import { CopyInput } from "@/components/CopyInput";
import { SectionDescription } from "@/components/Typography";

export function ApiKeysCreateButtonModal() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Create new secret key</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create new secret key</DialogTitle>
          <DialogDescription>
            This will create a new secret key for your account. You will need to
            use this secret key to authenticate your requests to the API.
          </DialogDescription>
        </DialogHeader>

        <ApiKeysForm />
      </DialogContent>
    </Dialog>
  );
}

function ApiKeysForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateApiKeyBody>({
    resolver: zodResolver(createApiKeyBody),
    defaultValues: {},
  });

  const [secretKey, setSecretKey] = useState("");

  const onSubmit: SubmitHandler<CreateApiKeyBody> = useCallback(
    async (data) => {
      const result = await createApiKeyAction(data);
      handleActionResult(result, "API key created!");

      if (!isActionError(result) && result?.secretKey) {
        setSecretKey(result.secretKey);
      } else {
        toastError({ description: "Failed to create API key" });
      }
    },
    [],
  );

  return !secretKey ? (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        type="text"
        name="name"
        label="Name (optional)"
        placeholder="My secret key"
        registerProps={register("name")}
        error={errors.name}
      />

      <Button type="submit" loading={isSubmitting}>
        Create
      </Button>
    </form>
  ) : (
    <div className="space-y-2">
      <SectionDescription>
        This will only be shown once. Please copy it. Your secret key is:
      </SectionDescription>
      <CopyInput value={secretKey} />
    </div>
  );
}

export function ApiKeysDeactivateButton({ id }: { id: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        const result = await deactivateApiKeyAction({ id });
        handleActionResult(result, "API key deactivated!");
      }}
    >
      Revoke
    </Button>
  );
}
