"use client";

import { useCallback } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { useAction } from "next-safe-action/hooks";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { toastSuccess, toastError } from "@/components/Toast";
import { adminHashEmailAction } from "@/utils/actions/admin";
import {
  hashEmailBody,
  type HashEmailBody,
} from "@/utils/actions/admin.validation";

export const AdminHashEmail = () => {
  const {
    execute: hashEmail,
    isExecuting,
    result,
  } = useAction(adminHashEmailAction, {
    onError: ({ error }) => {
      toastError({
        description: `Error hashing value: ${error.serverError}`,
      });
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<HashEmailBody>({
    resolver: zodResolver(hashEmailBody),
  });

  const onSubmit: SubmitHandler<HashEmailBody> = useCallback(
    (data) => {
      hashEmail({ email: data.email });
    },
    [hashEmail],
  );

  const copyToClipboard = () => {
    if (result.data?.hash) {
      navigator.clipboard.writeText(result.data.hash);
      toastSuccess({
        description: "Hash copied to clipboard",
      });
    }
  };

  return (
    <form className="max-w-sm space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <div className="space-y-2">
        <h3 className="text-lg font-medium">Hash for Log Search</h3>
      </div>

      <Input
        type="text"
        name="email"
        label="Value to Hash"
        placeholder="user@example.com"
        registerProps={register("email")}
        error={errors.email}
      />

      <Button type="submit" loading={isExecuting}>
        Generate Hash
      </Button>

      {result.data?.hash && (
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              type="text"
              name="hashedValue"
              label="Hashed Value"
              registerProps={{
                value: result.data.hash,
                readOnly: true,
              }}
              className="font-mono text-xs"
            />
          </div>
          <div className="flex items-end">
            <Button type="button" variant="outline" onClick={copyToClipboard}>
              Copy
            </Button>
          </div>
        </div>
      )}
    </form>
  );
};
