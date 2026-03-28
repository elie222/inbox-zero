import prisma from "@/utils/prisma";
import { WebClient } from "@slack/web-api";

export async function postBatchSummary(params: {
  slackAccessToken: string;
  channelId: string;
}): Promise<number> {
  const { slackAccessToken, channelId } = params;

  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);

  const emails = await prisma.cosFilteredEmail.findMany({
    where: {
      filterReason: "batch_summary",
      createdAt: { gte: fourHoursAgo },
    },
    orderBy: { createdAt: "desc" },
  });

  if (emails.length === 0) return 0;

  const lines = emails.map(
    (e) =>
      `• \`${e.messageId}\` (${e.emailAccountId}) — ${e.subject ?? "(no subject)"}`,
  );

  const client = new WebClient(slackAccessToken);
  await client.chat.postMessage({
    channel: channelId,
    text: `Batch summary: ${emails.length} email(s) in the last 4 hours`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Batch Summary* — ${emails.length} email(s) in the last 4 hours:\n${lines.join("\n")}`,
        },
      },
    ],
  });

  return emails.length;
}
