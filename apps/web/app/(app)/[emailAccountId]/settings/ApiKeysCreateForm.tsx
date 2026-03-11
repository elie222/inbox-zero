"use client";

import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { useParams } from "next/navigation";
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
import { getActionErrorMessage } from "@/utils/error";
import { CopyInput } from "@/components/CopyInput";
import { SectionDescription } from "@/components/Typography";
import { Checkbox } from "@/components/ui/checkbox";
import {
  API_KEY_EXPIRY_OPTIONS,
  API_KEY_SCOPE_OPTIONS,
  DEFAULT_API_KEY_SCOPES,
} from "@/utils/api-key-scopes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ApiKeysCreateButtonModal({ mutate }: { mutate: () => void }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Create key
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
  const [selectedScopes, setSelectedScopes] = useState<
    CreateApiKeyBody["scopes"]
  >(DEFAULT_API_KEY_SCOPES);
  const [expiresIn, setExpiresIn] =
    useState<CreateApiKeyBody["expiresIn"]>("90");
  const params = useParams<{ emailAccountId?: string }>();
  const emailAccountId = params.emailAccountId || "";

  const { execute, isExecuting } = useAction(
    createApiKeyAction.bind(null, emailAccountId),
    {
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
          description: getActionErrorMessage(error.error, {
            prefix: "Failed to create API key",
          }),
        });
      },
      onSettled: () => {
        mutate();
      },
    },
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateApiKeyBody>({
    resolver: zodResolver(createApiKeyBody),
    defaultValues: {
      scopes: DEFAULT_API_KEY_SCOPES,
      expiresIn: "90",
    },
  });

  const onSubmit = handleSubmit((data) => {
    execute({
      ...data,
      scopes: selectedScopes,
      expiresIn,
    });
  });

  const toggleScope = (
    scope: (typeof API_KEY_SCOPE_OPTIONS)[number]["value"],
    checked: boolean,
  ) => {
    setSelectedScopes((currentScopes) => {
      if (checked) return [...new Set([...currentScopes, scope])];
      return currentScopes.filter((currentScope) => currentScope !== scope);
    });
  };

  return !secretKey ? (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input
        type="text"
        name="name"
        label="Name (optional)"
        placeholder="Rules automation"
        registerProps={register("name")}
        error={errors.name}
      />

      <div className="space-y-2">
        <p className="text-sm font-medium">Permissions</p>
        <div className="space-y-3 rounded-md border p-3">
          {API_KEY_SCOPE_OPTIONS.map((scope) => (
            <div key={scope.value} className="flex items-start gap-3 text-sm">
              <Checkbox
                checked={selectedScopes.includes(scope.value)}
                onCheckedChange={(checked) =>
                  toggleScope(scope.value, checked === true)
                }
                aria-labelledby={`${scope.value}-label`}
              />
              <div className="space-y-1" id={`${scope.value}-label`}>
                <div className="font-medium">{scope.label}</div>
                <p className="text-muted-foreground">{scope.description}</p>
              </div>
            </div>
          ))}
        </div>
        {errors.scopes?.message ? (
          <p className="text-sm text-red-500">{errors.scopes.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Expiry</p>
        <Select
          value={expiresIn}
          onValueChange={(value: CreateApiKeyBody["expiresIn"]) =>
            setExpiresIn(value)
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {API_KEY_EXPIRY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <SectionDescription>
        This key will only work for the current inbox account.
      </SectionDescription>

      <Button
        type="submit"
        loading={isExecuting}
        disabled={!emailAccountId || selectedScopes.length === 0}
      >
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
  const params = useParams<{ emailAccountId?: string }>();
  const emailAccountId = params.emailAccountId || "";

  const { execute, isExecuting } = useAction(
    deactivateApiKeyAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "API key deactivated!" });
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error, {
            prefix: "Failed to deactivate API key",
          }),
        });
      },
      onSettled: () => {
        mutate();
      },
    },
  );

  return (
    <Button
      variant="outline"
      size="sm"
      loading={isExecuting}
      disabled={!emailAccountId}
      onClick={() => execute({ id })}
    >
      Revoke
    </Button>
  );
}
