import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { bulkSenderActionsBody } from "@/utils/actions/unsubscriber.validation";
import { readRequestJson } from "@/utils/read-request-json";
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
 * Unsubscribe and auto-archive each reserve one free-tier credit before the
 * sender change. A batch from a user with no allowance is rejected up front.
 * If the batch runs out of credits part way, later credit actions return
 * `reason: "unsubscribe_allowance"` and are not applied. Approve and clear
 * do not use a credit. At most 20 actions per request.
 */
export const POST = withEmailProvider("user/senders/bulk", async (request) => {
  const body = await readRequestJson(request);
  if ("response" in body) return body.response;

  const { actions } = bulkSenderActionsBody.parse(body.json);

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
