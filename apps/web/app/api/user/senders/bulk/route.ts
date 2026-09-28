import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { bulkSenderActionsBody } from "@/utils/actions/unsubscriber.validation";
import { userHasUnsubscribeAccess } from "@/utils/premium/unsubscribe-credits";
import {
  applySenderBulkActions,
  senderActionsRequireUnsubscribeAccess,
  type BulkSenderActionResult,
} from "@/utils/senders/bulk-actions";
import { unsubscribeAllowanceErrorResponse } from "@/utils/senders/unsubscribe-allowance";

export type BulkSenderActionsResponse = {
  results: BulkSenderActionResult[];
};

export const maxDuration = 180;

/**
 * Applies unsubscribe and sender-status changes for many senders.
 * Unsubscribe and auto-archive require unsubscribe allowance and each success
 * spends one free-tier credit. Approve and clear do not.
 * At most 20 actions per request.
 */
export const POST = withEmailProvider("user/senders/bulk", async (request) => {
  const { actions } = bulkSenderActionsBody.parse(await request.json());

  if (
    senderActionsRequireUnsubscribeAccess(actions) &&
    !(await userHasUnsubscribeAccess({ userId: request.auth.userId }))
  ) {
    return unsubscribeAllowanceErrorResponse();
  }

  const results = await applySenderBulkActions({
    actions,
    emailAccountId: request.auth.emailAccountId,
    emailProvider: request.emailProvider,
    userId: request.auth.userId,
    logger: request.logger,
  });

  return NextResponse.json({
    results,
  } satisfies BulkSenderActionsResponse);
});
