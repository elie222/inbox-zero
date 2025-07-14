"use client";

import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
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
} from "@/utils/actions/api-key.validation";
import {
  createApiKeyAction,
  deactivateApiKeyAction,
} from "@/utils/actions/api-key";
import { toastError, toastSuccess } from "@/components/Toast";
import { CopyInput } from "@/components/CopyInput";
import { SectionDescription } from "@/components/Typography";

export function ApiKeysCreateButtonModal({ mutate }: { mutate: () => void }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Create new secret key
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create new secret key</DialogTitle>
          <DialogDescription>
            This will create a new secret key for your account. You will need to
            use this secret key to authenticate your requests to the API.
          </DialogDescription>
        </DialogHeader>

        <ApiKeysForm mutate={mutate} />
      </DialogContent>
    </Dialog>
  );
}

function ApiKeysForm({ mutate }: { mutate: () => void }) {
  const [secretKey, setSecretKey] = useState("");

  const { execute, isExecuting } = useAction(createApiKeyAction, {
    onSuccess: (result) => {
      if (!result?.data?.secretKey) {
        toastError({ description: "Failed to create API key" });
        return;
      }

      setSecretKey(result.data.secretKey);
      toastSuccess({ description: "API key created!" });
    },
    onError: (error) => {
      toastError({
        description:
          `Failed to create API key. ${error.error.serverError || ""}`.trim(),
      });
    },
    onSettled: () => {
      mutate();
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateApiKeyBody>({
    resolver: zodResolver(createApiKeyBody),
    defaultValues: {},
  });

  return !secretKey ? (
    <form onSubmit={handleSubmit(execute)} className="space-y-4">
      <Input
        type="text"
        name="name"
        label="Name (optional)"
        placeholder="My secret key"
        registerProps={register("name")}
        error={errors.name}
      />

      <Button type="submit" loading={isExecuting}>
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

export function ApiKeysDeactivateButton({
  id,
  mutate,
}: {
  id: string;
  mutate: () => void;
}) {
  const { execute, isExecuting } = useAction(deactivateApiKeyAction, {
    onSuccess: () => {
      toastSuccess({ description: "API key deactivated!" });
    },
    onError: (error) => {
      toastError({
        description:
          `Failed to deactivate API key. ${error.error.serverError || ""}`.trim(),
      });
    },
    onSettled: () => {
      mutate();
    },
  });

  return (
    <Button
      variant="outline"
      size="sm"
      loading={isExecuting}
      onClick={() => execute({ id })}
    >
      Revoke
    </Button>
  );
}
