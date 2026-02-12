"use client";

import { useCallback } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { useAction } from "next-safe-action/hooks";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/Input";
import { toastError } from "@/components/Toast";
import { getActionErrorMessage } from "@/utils/error";
import { adminGetUserInfoAction } from "@/utils/actions/admin";
import {
  getUserInfoBody,
  type GetUserInfoBody,
} from "@/utils/actions/admin.validation";

export function AdminUserInfo() {
  const { execute, isExecuting, result } = useAction(adminGetUserInfoAction, {
    onError: (error) => {
      toastError({
        title: "Error looking up user",
        description: getActionErrorMessage(error.error),
      });
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<GetUserInfoBody>({
    resolver: zodResolver(getUserInfoBody),
  });

  const onSubmit: SubmitHandler<GetUserInfoBody> = useCallback(
    (data) => {
      execute({ email: data.email });
    },
    [execute],
  );

  const data = result.data;

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>User Info</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <Input
            type="email"
            name="email"
            label="Email"
            placeholder="user@example.com"
            registerProps={register("email")}
            error={errors.email}
          />
          <Button type="submit" loading={isExecuting}>
            Look Up
          </Button>
        </form>

        {data && (
          <div className="space-y-3 text-sm">
            <InfoRow label="User ID" value={data.id} />
            <InfoRow label="Created" value={formatDate(data.createdAt)} />
            <InfoRow
              label="Last Login"
              value={data.lastLogin ? formatDate(data.lastLogin) : "Never"}
            />
            <InfoRow
              label="Onboarding"
              value={data.completedOnboardingAt ? "Completed" : "Not completed"}
            />
            <InfoRow
              label="App Onboarding"
              value={
                data.completedAppOnboardingAt ? "Completed" : "Not completed"
              }
            />
            <InfoRow
              label="Email Accounts"
              value={String(data.emailAccountCount)}
            />
            <InfoRow
              label="Premium Tier"
              value={data.premium?.tier || "None"}
            />
            <InfoRow
              label="Subscription Status"
              value={data.premium?.subscriptionStatus || "N/A"}
            />
            <InfoRow
              label="Renews At"
              value={
                data.premium?.renewsAt
                  ? formatDate(data.premium.renewsAt)
                  : "N/A"
              }
            />

            {data.emailAccounts.map((ea) => (
              <div key={ea.email} className="space-y-1 rounded-md border p-3">
                <p className="font-medium">{ea.email}</p>
                <InfoRow label="Provider" value={ea.provider} />
                <InfoRow
                  label="Disconnected"
                  value={ea.disconnected ? "Yes" : "No"}
                />
                <InfoRow label="Rules" value={String(ea.ruleCount)} />
                <InfoRow
                  label="Watch Expires"
                  value={
                    ea.watchExpirationDate
                      ? formatDate(ea.watchExpirationDate)
                      : "Not watching"
                  }
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
