import { z } from "zod";
import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { syncAppleSubscriptionToDb } from "@/ee/billing/apple";

const syncAppleSubscriptionSchema = z.object({
  environment: z
    .enum(["Production", "Sandbox", "Xcode", "LocalTesting"])
    .optional(),
  transactionId: z.string().min(1),
});

export const POST = withAuth("apple/subscription/sync", async (request) => {
  const body = syncAppleSubscriptionSchema.parse(await request.json());
  const premium = await syncAppleSubscriptionToDb({
    authenticatedUserId: request.auth.userId,
    environmentHint: body.environment,
    logger: request.logger,
    transactionId: body.transactionId,
  });

  return NextResponse.json({
    premium,
  });
});
