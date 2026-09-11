"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { useForm } from "react-hook-form";
import { Input } from "@/components/Input";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/components/Toast";
import {
  createScimConnectionAction,
  revokeScimCredentialAction,
} from "@/utils/actions/scim";
import { getActionErrorMessage } from "@/utils/error";

export function AdminScimCredentials() {
  const [credential, setCredential] = useState<{
    token: string;
    connectionId: string;
    credentialId: string;
  } | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{
    providerId: string;
    expiresAt: string;
  }>();
  const { execute, isExecuting } = useAction(createScimConnectionAction, {
    onSuccess: ({ data }) => {
      setCredential({
        token: data.token,
        connectionId: data.connection.connectionId,
        credentialId: data.credential.credentialId,
      });
    },
    onError: (error) =>
      toastError({
        title: "Could not create SCIM credential",
        description: getActionErrorMessage(error.error),
      }),
  });

  return (
    <section aria-labelledby="scim-heading" className="max-w-xl space-y-4">
      <h2 id="scim-heading" className="text-lg font-semibold">
        SCIM provisioning
      </h2>
      <p className="text-sm text-muted-foreground">
        Create a connection for a registered organization SSO provider. Save the
        token and identifiers securely; the token is shown only once.
      </p>
      <form
        className="space-y-3"
        onSubmit={handleSubmit(({ providerId, expiresAt }) =>
          execute({
            providerId,
            expiresAt: new Date(expiresAt),
            creationRequestId: crypto.randomUUID(),
          }),
        )}
      >
        <Input
          name="scim-provider"
          label="SSO provider ID"
          type="text"
          registerProps={register("providerId", { required: true })}
          error={errors.providerId}
        />
        <Input
          name="scim-expiry"
          label="Credential expires at"
          type="datetime-local"
          registerProps={register("expiresAt", { required: true })}
          error={errors.expiresAt}
        />
        <Button type="submit" loading={isExecuting} disabled={!!credential}>
          Create SCIM connection
        </Button>
      </form>
      {credential && (
        <div className="space-y-2 rounded-md border p-4">
          <label
            htmlFor="scim-issued-credential"
            className="text-sm font-medium"
          >
            New SCIM credential — save before leaving
          </label>
          <textarea
            id="scim-issued-credential"
            className="w-full rounded border p-2 text-sm"
            rows={6}
            readOnly
            value={`Bearer token: ${credential.token}\nConnection ID: ${credential.connectionId}\nCredential ID: ${credential.credentialId}`}
          />
          <Button variant="outline" onClick={() => setCredential(null)}>
            Clear saved credential from screen
          </Button>
        </div>
      )}
      <RevokeScimCredentialForm />
    </section>
  );
}

function RevokeScimCredentialForm() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{
    providerId: string;
    connectionId: string;
    credentialId: string;
  }>();
  const { execute, isExecuting } = useAction(revokeScimCredentialAction, {
    onSuccess: () => {
      reset();
      toastSuccess({ title: "SCIM credential revoked" });
    },
    onError: (error) =>
      toastError({
        title: "Could not revoke SCIM credential",
        description: getActionErrorMessage(error.error),
      }),
  });
  return (
    <form className="space-y-3 border-t pt-4" onSubmit={handleSubmit(execute)}>
      <h3 className="font-medium">Revoke a credential</h3>
      <Input
        name="scim-revoke-provider"
        label="SSO provider ID to revoke"
        type="text"
        registerProps={register("providerId", { required: true })}
        error={errors.providerId}
      />
      <Input
        name="scim-revoke-connection"
        label="Connection ID"
        type="text"
        registerProps={register("connectionId", { required: true })}
        error={errors.connectionId}
      />
      <Input
        name="scim-revoke-credential"
        label="Credential ID"
        type="text"
        registerProps={register("credentialId", { required: true })}
        error={errors.credentialId}
      />
      <Button type="submit" variant="destructive" loading={isExecuting}>
        Revoke SCIM credential
      </Button>
    </form>
  );
}
