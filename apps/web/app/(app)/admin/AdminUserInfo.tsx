"use client";

import { useCallback } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { useAction } from "next-safe-action/hooks";
import { zodResolver } from "@hookform/resolvers/zod";
import { AdminLabelValueRow } from "@/app/(app)/admin/AdminLabelValueRow";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/Input";
import { toastError } from "@/components/Toast";
import { AdminPremiumMembershipSection } from "@/app/(app)/admin/AdminPremiumMembership";
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
    <Card className="max-w-4xl">
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
          <div className="space-y-4 text-sm">
            <div className="space-y-3 rounded-md border p-4">
              <p className="font-medium">User</p>
              <AdminLabelValueRow label="User ID" value={data.id} />
              <AdminLabelValueRow
                label="Created"
                value={formatDate(data.createdAt)}
              />
              <AdminLabelValueRow
                label="Last Login"
                value={data.lastLogin ? formatDate(data.lastLogin) : "Never"}
              />
              <AdminLabelValueRow
                label="Email Accounts"
                value={String(data.emailAccountCount)}
              />
              <AdminLabelValueRow
                label="Premium Tier"
                value={data.premium?.tier || "None"}
              />
              <AdminLabelValueRow
                label="Subscription Status"
                value={data.premium?.subscriptionStatus || "N/A"}
              />
              <AdminLabelValueRow
                label="Renews At"
                value={
                  data.premium?.renewsAt
                    ? formatDate(data.premium.renewsAt)
                    : "N/A"
                }
              />
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <p className="font-medium">Email Accounts</p>
              {data.emailAccounts.map((ea) => (
                <div key={ea.email} className="space-y-1 rounded-md border p-3">
                  <p className="font-medium">{ea.email}</p>
                  <AdminLabelValueRow label="Provider" value={ea.provider} />
                  <AdminLabelValueRow
                    label="Disconnected"
                    value={ea.disconnected ? "Yes" : "No"}
                  />
                  <AdminLabelValueRow
                    label="Rules"
                    value={String(ea.ruleCount)}
                  />
                  <AdminLabelValueRow
                    label="Last Rule Executed"
                    value={
                      ea.lastExecutedRuleAt
                        ? formatDate(ea.lastExecutedRuleAt)
                        : "Never"
                    }
                  />
                  <AdminLabelValueRow
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

            {data.premium && (
              <AdminPremiumMembershipSection
                lookupUserId={data.id}
                onRefresh={() => execute({ email: data.email })}
                premium={data.premium}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
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
