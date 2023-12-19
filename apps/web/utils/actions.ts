"use server";

import { z } from "zod";
import { deleteContact } from "@inboxzero/loops";
import {
  createFilterFromPrompt,
  type PromptQuery,
} from "@/app/api/ai/prompt/controller";
import { createLabel } from "@/app/api/google/labels/create/controller";
import { labelThread } from "@/app/api/google/threads/label/controller";
import { deletePromptHistory } from "@/app/api/user/prompt-history/controller";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { NewsletterStatus, type Label } from "@prisma/client";
import {
  deleteInboxZeroLabels,
  deleteUserLabels,
  saveUserLabels,
} from "@/utils/redis/label";
import { deletePlans } from "@/utils/redis/plan";
import { deleteUserStats } from "@/utils/redis/stats";
import { deleteTinybirdEmails } from "@inboxzero/tinybird";
import { deletePosthogUser } from "@/utils/posthog";
import { createAutoArchiveFilter, deleteFilter } from "@/utils/gmail/filter";
import { getGmailClient } from "@/utils/gmail/client";
import { trashThread } from "@/utils/gmail/trash";
import { env } from "@/env.mjs";
import { isPremium } from "@/utils/premium";

export async function createFilterFromPromptAction(body: PromptQuery) {
  return createFilterFromPrompt(body);
}

export async function createLabelAction(options: {
  name: string;
  description?: string;
}) {
  await createLabel(options);
}

export async function labelThreadsAction(options: {
  labelId: string;
  threadIds: string[];
  archive: boolean;
}) {
  return await Promise.all(
    options.threadIds.map((threadId) => {
      labelThread({
        labelId: options.labelId,
        threadId,
        archive: options.archive,
      });
    }),
  );
}

// export async function archiveThreadAction(options: { threadId: string }) {
//   return await archiveEmail({ id: options.threadId })
// }

const saveAboutBody = z.object({
  about: z.string(),
});
export type SaveAboutBody = z.infer<typeof saveAboutBody>;

export async function saveAboutAction(options: SaveAboutBody) {
  const session = await auth();
  if (!session?.user.email) throw new Error("Not logged in");

  await prisma.user.update({
    where: { email: session.user.email },
    data: { about: options.about },
  });
}

export async function deleteAccountAction() {
  const session = await auth();
  if (!session?.user.email) throw new Error("Not logged in");

  await deleteUserLabels({ email: session.user.email });
  await deleteInboxZeroLabels({ email: session.user.email });
  await deletePlans({ userId: session.user.id });
  await deleteUserStats({ email: session.user.email });
  await deleteTinybirdEmails({ email: session.user.email });
  await deletePosthogUser({ email: session.user.email });
  await deleteContact(session.user.email);

  await prisma.user.delete({ where: { email: session.user.email } });
}

export async function updateLabels(
  labels: Pick<Label, "name" | "description" | "enabled" | "gmailLabelId">[],
) {
  const session = await auth();
  if (!session?.user.email) throw new Error("Not logged in");

  const userId = session.user.id;

  const enabledLabels = labels.filter((label) => label.enabled);
  const disabledLabels = labels.filter((label) => !label.enabled);

  await prisma.$transaction([
    ...enabledLabels.map((label) => {
      const { name, description, enabled, gmailLabelId } = label;

      return prisma.label.upsert({
        where: { name_userId: { name, userId } },
        create: {
          gmailLabelId,
          name,
          description,
          enabled,
          user: { connect: { id: userId } },
        },
        update: {
          name,
          description,
          enabled,
        },
      });
    }),
    prisma.label.deleteMany({
      where: {
        userId,
        name: { in: disabledLabels.map((label) => label.name) },
      },
    }),
  ]);

  await saveUserLabels({
    email: session.user.email,
    labels: enabledLabels.map((l) => ({
      ...l,
      id: l.gmailLabelId,
    })),
  });
}

export async function deletePromptHistoryAction(options: { id: string }) {
  const session = await auth();
  if (!session) throw new Error("Not logged in");

  return deletePromptHistory({ id: options.id, userId: session.user.id });
}

export async function completedOnboarding() {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");

  await prisma.user.update({
    where: { id: session.user.id },
    data: { completedOnboarding: true },
  });
}

// do not return functions to the client or we'll get an error
const isStatusOk = (status: number) => status >= 200 && status < 300;

export async function createAutoArchiveFilterAction(
  from: string,
  gmailLabelId?: string,
) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");

  const gmail = getGmailClient(session);

  const res = await createAutoArchiveFilter({ gmail, from, gmailLabelId });

  return isStatusOk(res.status) ? { ok: true } : res;
}

export async function deleteFilterAction(id: string) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");

  const gmail = getGmailClient(session);

  const res = await deleteFilter({ gmail, id });

  return isStatusOk(res.status) ? { ok: true } : res;
}

export async function trashThreadAction(threadId: string) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");

  const gmail = getGmailClient(session);

  const res = await trashThread({ gmail, threadId });

  return isStatusOk(res.status) ? { ok: true } : res;
}

export async function changePremiumStatus(userEmail: string, upgrade: boolean) {
  const session = await auth();
  if (!session?.user.email) throw new Error("Not logged in");

  if (!env.ADMINS?.includes(session.user.email)) throw new Error("Not admin");

  const ONE_YEAR = 1000 * 60 * 60 * 24 * 365;

  await prisma.user.update({
    where: { email: userEmail },
    data: upgrade
      ? { lemonSqueezyRenewsAt: new Date(+new Date() + ONE_YEAR) }
      : { lemonSqueezyRenewsAt: null },
  });
}

export async function setNewsletterStatus(options: {
  newsletterEmail: string;
  status: NewsletterStatus | null;
}) {
  const session = await auth();
  if (!session?.user.email) throw new Error("Not logged in");

  return await prisma.newsletter.upsert({
    where: {
      email_userId: {
        email: options.newsletterEmail,
        userId: session.user.id,
      },
    },
    create: {
      status: options.status,
      email: options.newsletterEmail,
      user: { connect: { id: session.user.id } },
    },
    update: { status: options.status },
  });
}

export async function decrementUnsubscribeCredit() {
  const session = await auth();
  if (!session?.user.email) throw new Error("Not logged in");

  const user = await prisma.user.findUniqueOrThrow({
    where: { email: session.user.email },
    select: {
      unsubscribeCredits: true,
      unsubscribeMonth: true,
      lemonSqueezyRenewsAt: true,
    },
  });

  const premium = isPremium(user.lemonSqueezyRenewsAt);
  if (premium) return;

  const currentMonth = new Date().getMonth() + 1;

  if (!user.unsubscribeMonth || user.unsubscribeMonth !== currentMonth) {
    // reset the monthly credits
    await prisma.user.update({
      where: { email: session.user.email },
      data: {
        // reset and use a credit
        unsubscribeCredits: env.NEXT_PUBLIC_UNSUBSCRIBE_CREDITS - 1,
        unsubscribeMonth: currentMonth,
      },
    });
  } else {
    if (!user?.unsubscribeCredits || user.unsubscribeCredits <= 0) return;

    // decrement the monthly credits
    await prisma.user.update({
      where: { email: session.user.email },
      data: { unsubscribeCredits: { decrement: 1 } },
    });
  }
}
