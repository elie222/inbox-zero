import prisma from "@/utils/prisma";
import { WebClient } from "@slack/web-api";

export async function retryFailedEmails(params: {
  slackAccessToken: string;
  channelId: string;
}): Promise<{ retried: number; deadLettered: number }> {
  const { slackAccessToken, channelId } = params;

  const failedEmails = await prisma.processedEmail.findMany({
    where: {
      status: "failed",
      retryCount: { lt: 3 },
    },
  });

  let retried = 0;
  let deadLettered = 0;

  for (const email of failedEmails) {
    if (email.retryCount + 1 >= 3) {
      // Mark as dead letter
      await prisma.processedEmail.update({
        where: { id: email.id },
        data: { status: "dead_letter" },
      });

      // Post Slack alert
      const client = new WebClient(slackAccessToken);
      await client.chat.postMessage({
        channel: channelId,
        text: `Dead letter: email ${email.messageId} (account ${email.emailAccountId}) has failed 3 times and will not be retried.`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `:skull: *Dead Letter* — Email \`${email.messageId}\` (account \`${email.emailAccountId}\`) has exhausted all retries and will not be processed again.`,
            },
          },
        ],
      });

      deadLettered++;
    } else {
      // Increment retry count (actual re-processing wired via processOneEmail later)
      await prisma.processedEmail.update({
        where: { id: email.id },
        data: { retryCount: { increment: 1 } },
      });

      retried++;
    }
  }

  return { retried, deadLettered };
}
