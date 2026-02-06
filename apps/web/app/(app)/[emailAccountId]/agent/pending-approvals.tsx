"use client";

import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getActionErrorMessage } from "@/utils/error";
import { approveAgentAction, denyAgentAction } from "@/utils/actions/agent";

export function PendingApprovalCard({
  approvalId,
  label,
}: {
  approvalId: string;
  label: string;
}) {
  const { emailAccountId } = useAccount();
  const { execute: approve, isExecuting: isApproving } = useAction(
    approveAgentAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Approved action." });
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error, {
            prefix: "Failed to approve action",
          }),
        });
      },
    },
  );
  const { execute: deny, isExecuting: isDenying } = useAction(
    denyAgentAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Denied action." });
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error, {
            prefix: "Failed to deny action",
          }),
        });
      },
    },
  );
  const isLoading = isApproving || isDenying;

  return (
    <div className="flex items-center justify-between gap-3 rounded border p-3">
      <div className="text-sm">
        Approval required: <span className="font-medium">{label}</span>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={isLoading}
          onClick={() => deny({ approvalId })}
        >
          {isDenying ? "Denying..." : "Deny"}
        </Button>
        <Button
          size="sm"
          disabled={isLoading}
          onClick={() => approve({ approvalId })}
        >
          {isApproving ? "Approving..." : "Approve"}
        </Button>
      </div>
    </div>
  );
}
