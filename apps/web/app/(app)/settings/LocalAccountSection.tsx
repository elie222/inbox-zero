"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import useSWR from "swr";
import type { z } from "zod";
import type { LocalAccountSettingsResponse } from "@/app/api/user/local-account/route";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateLocalPasswordAction } from "@/utils/actions/local-password";
import { updateLocalPasswordBody } from "@/utils/actions/local-password.validation";
import { getActionErrorMessage } from "@/utils/error";

export function LocalAccountSection() {
  const { data, error, isLoading, mutate } =
    useSWR<LocalAccountSettingsResponse>("/api/user/local-account");
  const [feedback, setFeedback] = useState<{
    error: boolean;
    text: string;
  } | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof updateLocalPasswordBody>>({
    resolver: zodResolver(updateLocalPasswordBody),
  });
  const { execute, isExecuting } = useAction(updateLocalPasswordAction, {
    onSuccess: () => {
      reset();
      setFeedback({
        error: false,
        text: "Your local password has been updated.",
      });
      mutate();
    },
    onError: ({ error }) =>
      setFeedback({ error: true, text: getActionErrorMessage(error) }),
  });
  if (data && !data.enabled) return null;
  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <section className="border-b p-4" aria-labelledby="local-account-title">
          <h3 id="local-account-title" className="font-medium">
            Local account
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to Inbox Zero with {data.email} and your local password.
          </p>
          {!data.canManage ? (
            <p className="mt-3 text-sm">
              Sign in with your password or connected provider to change your
              password.
            </p>
          ) : (
            <form
              className="mt-4 grid max-w-sm gap-4"
              onSubmit={handleSubmit((values) => {
                setFeedback(null);
                execute(values);
              })}
            >
              {data.hasPassword && (
                <div className="grid gap-2">
                  <Label htmlFor="local-current-password">
                    Current password
                  </Label>
                  <Input
                    id="local-current-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    {...register("currentPassword")}
                  />
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="local-new-password">New password</Label>
                <Input
                  id="local-new-password"
                  type="password"
                  autoComplete="new-password"
                  {...register("newPassword")}
                />
                <p className="text-xs text-muted-foreground">
                  Use at least 12 characters.
                </p>
                {errors.newPassword && (
                  <p className="text-sm text-destructive">
                    {errors.newPassword.message}
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="local-confirm-password">
                  Confirm new password
                </Label>
                <Input
                  id="local-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  {...register("confirmPassword")}
                />
                {errors.confirmPassword && (
                  <p className="text-sm text-destructive">
                    {errors.confirmPassword.message}
                  </p>
                )}
              </div>
              {feedback && (
                <p
                  role={feedback.error ? "alert" : "status"}
                  className={
                    feedback.error ? "text-sm text-destructive" : "text-sm"
                  }
                >
                  {feedback.text}
                </p>
              )}
              <Button type="submit" loading={isExecuting}>
                {data.hasPassword ? "Change password" : "Set password"}
              </Button>
            </form>
          )}
        </section>
      )}
    </LoadingContent>
  );
}
