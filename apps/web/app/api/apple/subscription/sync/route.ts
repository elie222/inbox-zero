import { z } from "zod";
import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import {
  syncAppleSubscriptionToDb,
  verifyAppleSignedTransaction,
} from "@/ee/billing/apple";

const syncAppleSubscriptionSchema = z
  .object({
    environment: z
      .enum(["Production", "Sandbox", "Xcode", "LocalTesting"])
      .optional(),
    signedTransaction: z.string().min(1).optional(),
    transactionId: z.string().min(1).optional(),
  })
  .refine((body) => Boolean(body.signedTransaction || body.transactionId), {
    message: "signedTransaction or transactionId is required",
  });

export type SyncAppleSubscriptionResponse = {
  premium: Awaited<ReturnType<typeof syncAppleSubscriptionToDb>>;
};

export const POST = withAuth("apple/subscription/sync", async (request) => {
  const body = syncAppleSubscriptionSchema.parse(await request.json());
  const verifiedTransaction = body.signedTransaction
    ? await verifyAppleSignedTransaction(body.signedTransaction)
    : null;
  const premium = await syncAppleSubscriptionToDb({
    authenticatedUserId: request.auth.userId,
    environmentHint: body.environment ?? verifiedTransaction?.environment,
    logger: request.logger,
    originalTransactionId: verifiedTransaction?.originalTransactionId,
    transactionId:
      body.transactionId ?? verifiedTransaction?.transactionId ?? null,
    verifiedTransaction,
  });

  return NextResponse.json({ premium } satisfies SyncAppleSubscriptionResponse);
});
