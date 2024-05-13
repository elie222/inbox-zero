"use server";

import { z } from "zod";
import { withServerActionInstrumentation } from "@sentry/nextjs";
import { type gmail_v1 } from "googleapis";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { ColdEmailStatus } from "@prisma/client";
import { labelThread } from "@/utils/gmail/label";
import { INBOX_LABEL_ID, getGmailLabel, inboxZeroLabels } from "@/utils/label";
import { getGmailClient } from "@/utils/gmail/client";
import { getThreads } from "@/utils/gmail/thread";

const markNotColdEmailBody = z.object({ sender: z.string() });

export async function markNotColdEmail(body: { sender: string }) {
  return await withServerActionInstrumentation(
    "markNotColdEmail",
    {
      recordResponse: true,
    },
    async () => {
      const session = await auth();
      if (!session?.user.id) throw new Error("Not logged in");

      const { data, error } = markNotColdEmailBody.safeParse(body);
      if (error) return { error: error.message };

      const { sender } = data;

      const gmail = getGmailClient(session);

      await Promise.all([
        prisma.newsletter.update({
          where: { email_userId: { email: sender, userId: session.user.id } },
          data: {
            coldEmail: ColdEmailStatus.NOT_COLD_EMAIL,
          },
        }),
        removeColdEmailLabelFromSender(gmail, sender),
      ]);

      return { ok: true };
    },
  );
}

async function removeColdEmailLabelFromSender(
  gmail: gmail_v1.Gmail,
  sender: string,
) {
  // 1. find cold email label
  // 2. find emails from sender
  // 3. remove cold email label from emails

  const label = await getGmailLabel({
    gmail,
    labelName: inboxZeroLabels.cold_email,
  });
  if (!label?.id) return;

  const threads = await getThreads(`from:${sender}`, [label.id], gmail);

  for (const thread of threads.threads || []) {
    if (!thread.id) continue;
    await labelThread({
      gmail,
      threadId: thread.id,
      addLabelIds: [INBOX_LABEL_ID],
      removeLabelIds: [label.id],
    });
  }
}
