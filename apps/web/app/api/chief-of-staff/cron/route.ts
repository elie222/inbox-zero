import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { retryFailedEmails } from "@/utils/chief-of-staff/jobs/retry-failed";
import { postBatchSummary } from "@/utils/chief-of-staff/jobs/batch-summary";
import { refreshSignatures } from "@/utils/chief-of-staff/jobs/refresh-signatures";
import { refreshVipCache } from "@/utils/chief-of-staff/jobs/refresh-vip-cache";

function getCronSecret(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length);
}

async function getSlackChannel(): Promise<{
  slackAccessToken: string;
  channelId: string;
} | null> {
  const channelId = process.env.CHIEF_OF_STAFF_SLACK_CHANNEL_ID;
  if (!channelId) return null;

  // Find first connected Slack messaging channel
  const messagingChannel = await prisma.messagingChannel.findFirst({
    where: { provider: "SLACK", isConnected: true },
    select: { accessToken: true },
  });

  if (!messagingChannel?.accessToken) return null;

  return { slackAccessToken: messagingChannel.accessToken, channelId };
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "Cron secret not configured" },
      { status: 500 },
    );
  }

  const provided = getCronSecret(request);
  if (provided !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type");

  switch (type) {
    case "retry-failed": {
      const slack = await getSlackChannel();
      if (!slack) {
        return NextResponse.json(
          { error: "Slack channel not configured" },
          { status: 500 },
        );
      }
      const result = await retryFailedEmails(slack);
      return NextResponse.json(result);
    }

    case "batch-summary": {
      const slack = await getSlackChannel();
      if (!slack) {
        return NextResponse.json(
          { error: "Slack channel not configured" },
          { status: 500 },
        );
      }
      const count = await postBatchSummary(slack);
      return NextResponse.json({ posted: count });
    }

    case "refresh-signatures": {
      const count = await refreshSignatures();
      return NextResponse.json({ refreshed: count });
    }

    case "refresh-vip-cache": {
      const count = await refreshVipCache();
      return NextResponse.json({ refreshed: count });
    }

    default:
      return NextResponse.json(
        { error: `Unknown cron type: ${type}` },
        { status: 400 },
      );
  }
}
