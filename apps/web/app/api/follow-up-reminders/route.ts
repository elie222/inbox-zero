import { NextResponse } from "next/server";
import { env } from "@/env";
import { withError } from "@/utils/middleware";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import { processAllFollowUpReminders } from "./process";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

export const GET = withError("follow-up-reminders", async (request) => {
  if (!hasCronSecret(request)) {
    captureException(
      new Error("Unauthorized request: api/follow-up-reminders"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  if (!env.NEXT_PUBLIC_FOLLOW_UP_REMINDERS_ENABLED) {
    return NextResponse.json({ message: "Follow-up reminders disabled" });
  }

  const result = await processAllFollowUpReminders(request.logger);

  return NextResponse.json(result);
});

export const POST = withError("follow-up-reminders", async (request) => {
  if (!(await hasPostCronSecret(request))) {
    captureException(
      new Error("Unauthorized cron request: api/follow-up-reminders"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  if (!env.NEXT_PUBLIC_FOLLOW_UP_REMINDERS_ENABLED) {
    return NextResponse.json({ message: "Follow-up reminders disabled" });
  }

  const result = await processAllFollowUpReminders(request.logger);

  return NextResponse.json(result);
});
