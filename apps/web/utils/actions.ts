"use server";

import { z } from "zod";
import uniq from "lodash/uniq";
import { withServerActionInstrumentation } from "@sentry/nextjs";
import { deleteContact as deleteLoopsContact } from "@inboxzero/loops";
import { deleteContact as deleteResendContact } from "@inboxzero/resend";
import {
  createFilterFromPrompt,
  type PromptQuery,
} from "@/app/api/ai/prompt/controller";
import { createLabel } from "@/app/api/google/labels/create/controller";
import { labelThread } from "@/app/api/google/threads/label/controller";
import { deletePromptHistory } from "@/app/api/user/prompt-history/controller";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { NewsletterStatus, type Label, PremiumTier } from "@prisma/client";
import {
  deleteInboxZeroLabels,
  deleteUserLabels,
  saveUserLabels,
} from "@/utils/redis/label";
import { deletePlans } from "@/utils/redis/plan";
import { deleteUserStats } from "@/utils/redis/stats";
import { deleteTinybirdEmails } from "@inboxzero/tinybird";
import { deleteTinybirdAiCalls } from "@inboxzero/tinybird-ai-analytics";
import { deletePosthogUser } from "@/utils/posthog";
import { createAutoArchiveFilter, deleteFilter } from "@/utils/gmail/filter";
import { getGmailClient } from "@/utils/gmail/client";
import { trashThread } from "@/utils/gmail/trash";
import { env } from "@/env.mjs";
import { isPremium } from "@/utils/premium";
import { cancelPremium, upgradeToPremium } from "@/utils/premium/server";
import { ChangePremiumStatusOptions } from "@/app/(app)/admin/validation";
import { updateSubscriptionItemQuantity } from "@/app/api/lemon-squeezy/api";
import { captureException } from "@/utils/error";
import { isAdmin } from "@/utils/admin";

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

  try {
    await Promise.allSettled([
      deleteUserLabels({ email: session.user.email }),
      deleteInboxZeroLabels({ email: session.user.email }),
      deletePlans({ userId: session.user.id }),
      deleteUserStats({ email: session.user.email }),
      deleteTinybirdEmails({ email: session.user.email }),
      deleteTinybirdAiCalls({ userId: session.user.email }),
      deletePosthogUser({ email: session.user.email }),
      deleteLoopsContact(session.user.email),
      deleteResendContact({ email: session.user.email }),
    ]);
  } catch (error) {
    console.error("Error while deleting account: ", error);
    captureException(error);
  }

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

export async function changePremiumStatus(options: ChangePremiumStatusOptions) {
  const session = await auth();
  if (!session?.user.email) throw new Error("Not logged in");
  if (!isAdmin(session.user.email)) throw new Error("Not admin");

  const userToUpgrade = await prisma.user.findUniqueOrThrow({
    where: { email: options.email },
    select: { id: true, premiumId: true },
  });

  const ONE_MONTH = 1000 * 60 * 60 * 24 * 30;

  if (options.upgrade) {
    await upgradeToPremium({
      userId: userToUpgrade.id,
      tier: options.period,
      lemonSqueezyCustomerId: options.lemonSqueezyCustomerId || null,
      lemonSqueezySubscriptionId: null,
      lemonSqueezySubscriptionItemId: null,
      lemonSqueezyOrderId: null,
      lemonSqueezyProductId: null,
      lemonSqueezyVariantId: null,
      lemonSqueezyRenewsAt:
        options.period === PremiumTier.PRO_ANNUALLY ||
        options.period === PremiumTier.BUSINESS_ANNUALLY
          ? new Date(+new Date() + ONE_MONTH * 12)
          : options.period === PremiumTier.PRO_MONTHLY ||
              options.period === PremiumTier.BUSINESS_MONTHLY
            ? new Date(+new Date() + ONE_MONTH)
            : null,
    });
  } else if (userToUpgrade) {
    if (userToUpgrade.premiumId) {
      await cancelPremium({
        premiumId: userToUpgrade.premiumId,
        lemonSqueezyEndsAt: new Date(),
      });
    } else {
      throw new Error("User not premium.");
    }
  }
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
      premium: {
        select: {
          id: true,
          unsubscribeCredits: true,
          unsubscribeMonth: true,
          lemonSqueezyRenewsAt: true,
        },
      },
    },
  });

  const isUserPremium = isPremium(user.premium?.lemonSqueezyRenewsAt || null);
  if (isUserPremium) return;

  const currentMonth = new Date().getMonth() + 1;

  // create premium row for user if it doesn't already exist
  const premium = user.premium || (await createPremiumForUser(session.user.id));

  if (
    !premium?.unsubscribeMonth ||
    premium?.unsubscribeMonth !== currentMonth
  ) {
    // reset the monthly credits
    await prisma.premium.update({
      where: { id: premium.id },
      data: {
        // reset and use a credit
        unsubscribeCredits: env.NEXT_PUBLIC_UNSUBSCRIBE_CREDITS - 1,
        unsubscribeMonth: currentMonth,
      },
    });
  } else {
    if (!premium?.unsubscribeCredits || premium.unsubscribeCredits <= 0) return;

    // decrement the monthly credits
    await prisma.premium.update({
      where: { id: premium.id },
      data: { unsubscribeCredits: { decrement: 1 } },
    });
  }
}

export async function updateMultiAccountPremium(
  emails: string[],
): Promise<
  | void
  | { error: string; warning?: string }
  | { error?: string; warning: string }
> {
  return await withServerActionInstrumentation(
    "updateMultiAccountPremium",
    {
      recordResponse: true,
    },
    async () => {
      const session = await auth();
      if (!session?.user.id) return { error: "Not logged in" };

      const user = await prisma.user.findUniqueOrThrow({
        where: { id: session.user.id },
        select: {
          premium: {
            select: {
              id: true,
              tier: true,
              lemonSqueezySubscriptionItemId: true,
            },
          },
        },
      });

      // check all users exist
      const uniqueEmails = uniq(emails);
      const users = await prisma.user.findMany({
        where: { email: { in: uniqueEmails } },
        select: { id: true, premium: true },
      });

      const premium =
        user.premium || (await createPremiumForUser(session.user.id));

      const otherUsersToAdd = users.filter((u) => u.id !== session.user.id);

      // make sure that the users being added to this plan are not on higher tiers already
      for (const userToAdd of otherUsersToAdd) {
        if (isOnHigherTier(userToAdd.premium?.tier, premium.tier)) {
          return {
            error:
              "One of the users you are adding to your plan already has premium and cannot be added.",
          };
        }
      }

      if (!premium.lemonSqueezySubscriptionItemId) {
        return {
          error: `You must upgrade to premium before adding more users to your account. If you already have a premium plan, please contact support at ${env.NEXT_PUBLIC_SUPPORT_EMAIL}`,
        };
      }

      await updateSubscriptionItemQuantity({
        id: premium.lemonSqueezySubscriptionItemId,
        quantity: otherUsersToAdd.length + 1,
      });

      // delete premium for other users when adding them to this premium plan
      await prisma.premium.deleteMany({
        where: {
          users: { some: { id: { in: otherUsersToAdd.map((u) => u.id) } } },
        },
      });

      // add users to plan
      await prisma.premium.update({
        where: { id: premium.id },
        data: {
          users: { connect: otherUsersToAdd.map((user) => ({ id: user.id })) },
        },
      });

      if (users.length < uniqueEmails.length) {
        return {
          warning:
            "Not all users exist. Each account must sign up to Inbox Zero to share premium with it.",
        };
      }
    },
  );
}

async function createPremiumForUser(userId: string) {
  return await prisma.premium.create({
    data: { users: { connect: { id: userId } } },
  });
}

function isOnHigherTier(
  tier1?: PremiumTier | null,
  tier2?: PremiumTier | null,
) {
  const tierRanking = {
    [PremiumTier.PRO_MONTHLY]: 1,
    [PremiumTier.PRO_ANNUALLY]: 2,
    [PremiumTier.BUSINESS_MONTHLY]: 3,
    [PremiumTier.BUSINESS_ANNUALLY]: 4,
    [PremiumTier.LIFETIME]: 5,
  };

  const tier1Rank = tier1 ? tierRanking[tier1] : 0;
  const tier2Rank = tier2 ? tierRanking[tier2] : 0;

  return tier1Rank > tier2Rank;
}
