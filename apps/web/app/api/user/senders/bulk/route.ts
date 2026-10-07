import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { bulkSenderActionsBody } from "@/utils/actions/unsubscriber.validation";
import { readRequestJson } from "@/utils/read-request-json";
import {
  applySenderBulkActions,
  type BulkSenderActionResult,
} from "@/utils/senders/bulk-actions";

export type BulkSenderActionsResponse = {
  results: BulkSenderActionResult[];
};

export const maxDuration = 180;

/**
 * Applies unsubscribe and sender-status changes for many senders.
 * At most 20 actions per request. These mail actions do not use AI credits.
 */
export const POST = withEmailProvider("user/senders/bulk", async (request) => {
  const body = await readRequestJson(request);
  if ("response" in body) return body.response;

  const { actions } = bulkSenderActionsBody.parse(body.json);

  const results = await applySenderBulkActions({
    actions,
    emailAccountId: request.auth.emailAccountId,
    emailProvider: request.emailProvider,
    logger: request.logger,
  });

  return NextResponse.json({
    results,
  } satisfies BulkSenderActionsResponse);
});
