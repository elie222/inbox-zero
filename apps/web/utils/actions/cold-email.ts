"use server";

import { z } from "zod";
import type { gmail_v1 } from "@googleapis/gmail";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { ColdEmailStatus } from "@prisma/client";
import { getLabel, labelThread } from "@/utils/gmail/label";
import { GmailLabel } from "@/utils/gmail/label";
import { getGmailClient } from "@/utils/gmail/client";
import { getThreads } from "@/utils/gmail/thread";
import { inboxZeroLabels } from "@/utils/label";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import { emailToContent } from "@/utils/mail";
import { isColdEmail } from "@/utils/cold-email/is-cold-email";
import {
  coldEmailBlockerBody,
  type ColdEmailBlockerBody,
} from "@/utils/actions/validation";
import { formatZodError } from "@/utils/error";

const markNotColdEmailBody = z.object({ sender: z.string() });

export const markNotColdEmailAction = withActionInstrumentation(
  "markNotColdEmail",
  async (body: { sender: string }) => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    const { data, error } = markNotColdEmailBody.safeParse(body);
    if (error) return { error: error.message };

    const { sender } = data;

    const gmail = getGmailClient(session);

    await Promise.all([
      prisma.coldEmail.update({
        where: {
          userId_fromEmail: { userId: session.user.id, fromEmail: sender },
        },
        data: {
          status: ColdEmailStatus.USER_REJECTED_COLD,
        },
      }),
      removeColdEmailLabelFromSender(gmail, sender),
    ]);
  },
);

async function removeColdEmailLabelFromSender(
  gmail: gmail_v1.Gmail,
  sender: string,
) {
  // 1. find cold email label
  // 2. find emails from sender
  // 3. remove cold email label from emails

  const label = await getLabel({
    gmail,
    name: inboxZeroLabels.cold_email.name,
  });
  if (!label?.id) return;

  const threads = await getThreads(`from:${sender}`, [label.id], gmail);

  for (const thread of threads.threads || []) {
    if (!thread.id) continue;
    await labelThread({
      gmail,
      threadId: thread.id,
      addLabelIds: [GmailLabel.INBOX],
      removeLabelIds: [label.id],
    });
  }
}

export type ColdEmailBlockerResponse = Awaited<
  ReturnType<typeof checkColdEmail>
>;
export const testColdEmailAction = withActionInstrumentation(
  "testColdEmail",
  async (unsafeBody: ColdEmailBlockerBody) => {
    const session = await auth();
    if (!session?.user.email) return { error: "Not logged in" };

    const gmail = getGmailClient(session);

    const { data, error } = coldEmailBlockerBody.safeParse(unsafeBody);
    if (error) return { error: formatZodError(error) };

    const result = await checkColdEmail(data, gmail, session.user.email);

    return result;
  },
);

async function checkColdEmail(
  body: ColdEmailBlockerBody,
  gmail: gmail_v1.Gmail,
  userEmail: string,
) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: userEmail },
    select: {
      id: true,
      email: true,
      coldEmailPrompt: true,
      aiProvider: true,
      aiModel: true,
      aiApiKey: true,
    },
  });

  const content = emailToContent({
    textHtml: body.textHtml || undefined,
    textPlain: body.textPlain || undefined,
    snippet: body.snippet || "",
  });

  const response = await isColdEmail({
    email: {
      from: body.from,
      subject: body.subject,
      content,
      date: body.date ? new Date(body.date) : undefined,
      threadId: body.threadId || undefined,
      messageId: body.messageId,
    },
    user,
    gmail,
  });

  return response;
}
