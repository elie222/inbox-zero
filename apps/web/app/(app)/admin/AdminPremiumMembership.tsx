"use client";

import { useCallback, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { toastError, toastSuccess } from "@/components/Toast";
import {
  adminRemoveUserFromPremiumAction,
  type AdminPremiumMembership,
} from "@/utils/actions/admin";
import { getActionErrorMessage } from "@/utils/error";

export function AdminPremiumMembershipSection({
  lookupUserId,
  premium,
  onRefresh,
}: {
  lookupUserId: string;
  premium: AdminPremiumMembership;
  onRefresh: () => void;
}) {
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const { executeAsync, isExecuting } = useAction(
    adminRemoveUserFromPremiumAction,
    {
      onSuccess: ({ data }) => {
        if (!data) return;

        toastSuccess({
          description: `Removed ${data.removedUserEmail} from premium.`,
        });
        onRefresh();
      },
      onError: ({ error }) => {
        toastError({
          description: getActionErrorMessage(error, {
            prefix: "Failed to remove user from premium",
          }),
        });
      },
    },
  );

  const handleRemoveUser = useCallback(
    async (userId: string) => {
      setRemovingUserId(userId);
      await executeAsync({ premiumId: premium.id, userId });
      setRemovingUserId(null);
    },
    [executeAsync, premium.id],
  );

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="space-y-3">
        <p className="font-medium">Premium Membership</p>
        <DetailRow label="Premium ID" value={premium.id} />
        <DetailRow
          label="Seat Allowance"
          value={formatSeatAllowance(premium.emailAccountsAccess)}
        />
        <DetailRow label="Seats Used" value={String(premium.seatsUsed)} />
        <DetailRow label="Members" value={String(premium.users.length)} />
      </div>

      <div className="space-y-2">
        <p className="text-muted-foreground">Admins</p>
        <div className="flex flex-wrap gap-2">
          {premium.admins.length ? (
            premium.admins.map((admin) => (
              <Badge key={admin.id} variant="secondary">
                {admin.email}
              </Badge>
            ))
          ) : (
            <span className="text-muted-foreground">None</span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-muted-foreground">Pending Invites</p>
        <div className="flex flex-wrap gap-2">
          {premium.pendingInvites.length ? (
            premium.pendingInvites.map((invite) => (
              <Badge key={invite} variant="outline">
                {invite}
              </Badge>
            ))
          ) : (
            <span className="text-muted-foreground">None</span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-muted-foreground">Premium Users</p>
        {premium.users.map((premiumUser) => (
          <div
            key={premiumUser.id}
            className="space-y-3 rounded-md border bg-muted/20 p-3"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{premiumUser.email}</p>
                  {premiumUser.id === lookupUserId && (
                    <Badge variant="secondary">Lookup User</Badge>
                  )}
                  {premiumUser.isAdmin && (
                    <Badge variant="outline">Admin</Badge>
                  )}
                  <Badge variant="outline">
                    {premiumUser.emailAccountCount} account
                    {premiumUser.emailAccountCount === 1 ? "" : "s"}
                  </Badge>
                </div>
                {premiumUser.name && (
                  <p className="text-muted-foreground">{premiumUser.name}</p>
                )}
              </div>

              <ConfirmDialog
                title="Remove user from premium?"
                description={`This removes ${premiumUser.email} from the shared premium membership and reduces the billed seat count for their linked accounts.`}
                confirmText="Remove"
                trigger={
                  <Button
                    variant="outline"
                    size="sm"
                    loading={isExecuting && removingUserId === premiumUser.id}
                    disabled={isExecuting}
                  >
                    Remove from premium
                  </Button>
                }
                onConfirm={() => handleRemoveUser(premiumUser.id)}
              />
            </div>

            <div className="space-y-2">
              {premiumUser.emailAccounts.length ? (
                premiumUser.emailAccounts.map((emailAccount) => (
                  <div
                    key={emailAccount.id}
                    className="flex flex-col gap-2 rounded-md border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1">
                      <p>{emailAccount.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {emailAccount.provider}
                      </p>
                    </div>
                    {emailAccount.disconnected && (
                      <Badge variant="red">Disconnected</Badge>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground">
                  No linked email accounts.
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-all text-right">{value}</span>
    </div>
  );
}

function formatSeatAllowance(seatAllowance: number | null) {
  if (seatAllowance === null) return "Metered";
  return String(seatAllowance);
}
