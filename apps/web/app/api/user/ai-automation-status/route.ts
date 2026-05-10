import { NextResponse } from "next/server";
import { getUserTrialAiUsageLimitStatus } from "@/utils/llms/model-usage-guard";
import { withAuth } from "@/utils/middleware";

export type GetAiAutomationStatusResponse = Awaited<
  ReturnType<typeof getUserTrialAiUsageLimitStatus>
>;

export const GET = withAuth("user/ai-automation-status", async (request) =>
  NextResponse.json(
    await getUserTrialAiUsageLimitStatus({ userId: request.auth.userId }),
  ),
);
