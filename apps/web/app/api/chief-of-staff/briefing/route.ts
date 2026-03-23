import { withError } from "@/utils/middleware";
import { hasCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import {
  loadClients,
  gatherBriefingData,
} from "@/utils/chief-of-staff/briefing/gather";
import { generateBriefing } from "@/utils/chief-of-staff/briefing/engine";
import { formatBriefingForSlack } from "@/utils/chief-of-staff/briefing/format-slack";
import { postToChiefOfStaff } from "@/utils/chief-of-staff/slack/poster";

export const maxDuration = 300;

const logger = createScopedLogger("briefing:route");

export const GET = withError("chief-of-staff-briefing", async (request) => {
  if (!hasCronSecret(request)) {
    captureException(
      new Error("Unauthorized cron request: api/chief-of-staff/briefing"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  logger.info("Starting daily briefing generation");

  // 1. Load OAuth clients and Slack credentials
  const clients = await loadClients();

  // 2. Gather data in parallel
  const gatheredData = await gatherBriefingData({
    gmail: clients.gmail,
    calendar: clients.calendar,
  });

  // 3. Generate briefing via Claude
  let briefingMarkdown: string;
  try {
    briefingMarkdown = await generateBriefing(gatheredData);
  } catch (error) {
    logger.error("Claude briefing generation failed", { error });
    await postToChiefOfStaff({
      accessToken: clients.slack.accessToken,
      channelId: clients.slack.channelId,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "⚠️ *Daily briefing generation failed* — check server logs for details.",
          },
        },
      ],
      text: "Daily briefing generation failed",
    });
    return Response.json(
      { ok: false, error: "Claude generation failed" },
      { status: 500 },
    );
  }

  // 4. Format for Slack and post
  const blocks = formatBriefingForSlack(
    briefingMarkdown,
    gatheredData.generatedAt,
  );

  await postToChiefOfStaff({
    accessToken: clients.slack.accessToken,
    channelId: clients.slack.channelId,
    blocks,
    text: briefingMarkdown,
  });

  logger.info("Daily briefing posted to Slack");

  return Response.json({ ok: true });
});
