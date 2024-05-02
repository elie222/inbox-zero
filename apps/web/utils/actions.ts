"use server";

import { z } from "zod";
import uniq from "lodash/uniq";
import { withServerActionInstrumentation } from "@sentry/nextjs";
import { deleteContact as deleteLoopsContact } from "@inboxzero/loops";
import { deleteContact as deleteResendContact } from "@inboxzero/resend";
import { createLabel } from "@/app/api/google/labels/create/controller";
import { labelThread } from "@/app/api/google/threads/label/controller";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import {
  NewsletterStatus,
  type Label,
  PremiumTier,
  GroupItemType,
  RuleType,
  Prisma,
} from "@prisma/client";
import {
  deleteInboxZeroLabels,
  deleteUserLabels,
  saveUserLabels,
} from "@/utils/redis/label";
import { deleteUserStats } from "@/utils/redis/stats";
import { deleteTinybirdEmails } from "@inboxzero/tinybird";
import { deleteTinybirdAiCalls } from "@inboxzero/tinybird-ai-analytics";
import { deletePosthogUser } from "@/utils/posthog";
import { createAutoArchiveFilter, deleteFilter } from "@/utils/gmail/filter";
import { getGmailAccessToken, getGmailClient } from "@/utils/gmail/client";
import { trashMessage, trashThread } from "@/utils/gmail/trash";
import { env } from "@/env.mjs";
import { isOnHigherTier, isPremium } from "@/utils/premium";
import { cancelPremium, upgradeToPremium } from "@/utils/premium/server";
import { ChangePremiumStatusOptions } from "@/app/(app)/admin/validation";
import {
  archiveThread,
  markImportantMessage,
  markReadThread,
} from "@/utils/gmail/label";
import {
  activateLemonLicenseKey,
  getLemonCustomer,
  updateSubscriptionItemQuantity,
} from "@/app/api/lemon-squeezy/api";
import { captureException, isError } from "@/utils/error";
import { isAdmin } from "@/utils/admin";
import { markSpam } from "@/utils/gmail/spam";
import { ActBodyWithHtml } from "@/app/api/ai/act/validation";
import { revalidatePath } from "next/cache";
import {
  AddGroupItemBody,
  addGroupItemBody,
  CreateGroupBody,
  createGroupBody,
} from "@/utils/actions-validation";
import { findNewsletters } from "@/utils/ai/group/find-newsletters";
import { findReceipts } from "@/utils/ai/group/find-receipts";
import { aiCreateRule } from "@/utils/ai/rule/create-rule";
import { deleteRule } from "@/app/api/user/rules/controller";
import { runRulesOnMessage } from "@/app/api/google/webhook/run-rules";
import { parseMessage } from "@/utils/mail";
import { getMessage } from "@/utils/gmail/message";
import { getThread } from "@/utils/gmail/thread";

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

const saveAboutBody = z.object({ about: z.string() });
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

export async function completedOnboarding() {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");

  await prisma.user.update({
    where: { id: session.user.id },
    data: { completedOnboarding: true },
  });
}

export async function saveOnboardingAnswers(onboardingAnswers: {
  surveyId?: string;
  questions: any;
  answers: Record<string, string>;
}) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");

  await prisma.user.update({
    where: { id: session.user.id },
    data: { onboardingAnswers },
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

export async function archiveThreadAction(threadId: string) {
  const session = await auth();
  if (!session?.user.email) throw new Error("Not logged in");
  const gmail = getGmailClient(session);
  const res = await archiveThread({ gmail, threadId });
  return isStatusOk(res.status) ? { ok: true } : res;
}

export async function trashThreadAction(threadId: string) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");
  const gmail = getGmailClient(session);
  const res = await trashThread({ gmail, threadId });
  return isStatusOk(res.status) ? { ok: true } : res;
}
export async function trashMessageAction(messageId: string) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");
  const gmail = getGmailClient(session);
  const res = await trashMessage({ gmail, messageId });
  return isStatusOk(res.status) ? { ok: true } : res;
}

export async function markReadThreadAction(threadId: string, read: boolean) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");
  const gmail = getGmailClient(session);
  const res = await markReadThread({ gmail, threadId, read });
  return isStatusOk(res.status) ? { ok: true } : res;
}

export async function markImportantMessageAction(
  messageId: string,
  important: boolean,
) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");
  const gmail = getGmailClient(session);
  const res = await markImportantMessage({ gmail, messageId, important });
  return isStatusOk(res.status) ? { ok: true } : res;
}

export async function markSpamThreadAction(threadId: string) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");
  const gmail = getGmailClient(session);
  const res = await markSpam({ gmail, threadId });
  return isStatusOk(res.status) ? { ok: true } : res;
}

export async function runAiAction(email: ActBodyWithHtml["email"]) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");
  const gmail = getGmailClient(session);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      about: true,
      aiProvider: true,
      aiModel: true,
      openAIApiKey: true,
      rules: { include: { actions: true } },
    },
  });

  if (!user.email) throw new Error("User email not found");

  const [gmailMessage, gmailThread, hasExistingRule] = await Promise.all([
    getMessage(email.messageId, gmail, "full"),
    getThread(email.threadId, gmail),
    prisma.executedRule.findUnique({
      where: {
        unique_user_thread_message: {
          userId: user.id,
          threadId: email.threadId,
          messageId: email.messageId,
        },
      },
      select: { id: true },
    }),
  ]);

  if (hasExistingRule) {
    console.log("Skipping. Rule already exists.");
    return;
  }

  const message = parseMessage(gmailMessage);
  const isThread = !!gmailThread.messages && gmailThread.messages.length > 1;

  const result = await runRulesOnMessage({
    gmail,
    message,
    rules: user.rules,
    user: { ...user, email: user.email! },
    isThread,
  });

  return { ok: !isError(result) };
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

  let lemonSqueezySubscriptionId: number | null = null;
  let lemonSqueezySubscriptionItemId: number | null = null;
  let lemonSqueezyOrderId: number | null = null;
  let lemonSqueezyProductId: number | null = null;
  let lemonSqueezyVariantId: number | null = null;

  if (options.upgrade) {
    if (options.lemonSqueezyCustomerId) {
      const lemonCustomer = await getLemonCustomer(
        options.lemonSqueezyCustomerId.toString(),
      );
      if (!lemonCustomer.data) throw new Error("Lemon customer not found");
      const subscription = lemonCustomer.data.included?.find(
        (i) => i.type === "subscriptions",
      );
      if (!subscription) throw new Error("Subscription not found");
      lemonSqueezySubscriptionId = parseInt(subscription.id);
      const attributes = subscription.attributes as any;
      lemonSqueezyOrderId = parseInt(attributes.order_id);
      lemonSqueezyProductId = parseInt(attributes.product_id);
      lemonSqueezyVariantId = parseInt(attributes.variant_id);
      lemonSqueezySubscriptionItemId = attributes.first_subscription_item.id
        ? parseInt(attributes.first_subscription_item.id)
        : null;
    }

    await upgradeToPremium({
      userId: userToUpgrade.id,
      tier: options.period,
      lemonSqueezyCustomerId: options.lemonSqueezyCustomerId || null,
      lemonSqueezySubscriptionId,
      lemonSqueezySubscriptionItemId,
      lemonSqueezyOrderId,
      lemonSqueezyProductId,
      lemonSqueezyVariantId,
      lemonSqueezyRenewsAt:
        options.period === PremiumTier.PRO_ANNUALLY ||
        options.period === PremiumTier.BUSINESS_ANNUALLY
          ? new Date(+new Date() + ONE_MONTH * 12)
          : options.period === PremiumTier.PRO_MONTHLY ||
              options.period === PremiumTier.BUSINESS_MONTHLY
            ? new Date(+new Date() + ONE_MONTH)
            : null,
      emailAccountsAccess: options.emailAccountsAccess,
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
              emailAccountsAccess: true,
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

      if ((premium.emailAccountsAccess || 0) < users.length) {
        // TODO lifetime users
        if (!premium.lemonSqueezySubscriptionItemId) {
          return {
            error: `You must upgrade to premium before adding more users to your account. If you already have a premium plan, please contact support at ${env.NEXT_PUBLIC_SUPPORT_EMAIL}`,
          };
        }

        await updateSubscriptionItemQuantity({
          id: premium.lemonSqueezySubscriptionItemId,
          quantity: otherUsersToAdd.length + 1,
        });
      }

      // delete premium for other users when adding them to this premium plan
      // don't delete the premium for the current user
      await prisma.premium.deleteMany({
        where: {
          id: { not: premium.id },
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

export async function activateLicenseKey(licenseKey: string) {
  const session = await auth();
  if (!session?.user.email) throw new Error("Not logged in");

  const lemonSqueezyLicense = await activateLemonLicenseKey(
    licenseKey,
    `License for ${session.user.email}`,
  );

  if (lemonSqueezyLicense.error) {
    throw new Error(
      lemonSqueezyLicense.data?.error || "Error activating license",
    );
  }

  const seats = {
    [env.LICENSE_1_SEAT_VARIANT_ID || ""]: 1,
    [env.LICENSE_3_SEAT_VARIANT_ID || ""]: 3,
    [env.LICENSE_5_SEAT_VARIANT_ID || ""]: 5,
    [env.LICENSE_10_SEAT_VARIANT_ID || ""]: 10,
    [env.LICENSE_25_SEAT_VARIANT_ID || ""]: 25,
  };

  await upgradeToPremium({
    userId: session.user.id,
    tier: PremiumTier.LIFETIME,
    lemonLicenseKey: licenseKey,
    lemonLicenseInstanceId: lemonSqueezyLicense.data?.instance?.id,
    emailAccountsAccess: seats[lemonSqueezyLicense.data?.meta.variant_id || ""],
    lemonSqueezyCustomerId: lemonSqueezyLicense.data?.meta.customer_id || null,
    lemonSqueezyOrderId: lemonSqueezyLicense.data?.meta.order_id || null,
    lemonSqueezyProductId: lemonSqueezyLicense.data?.meta.product_id || null,
    lemonSqueezyVariantId: lemonSqueezyLicense.data?.meta.variant_id || null,
    lemonSqueezySubscriptionId: null,
    lemonSqueezySubscriptionItemId: null,
    lemonSqueezyRenewsAt: null,
  });
}

export async function createGroupAction(body: CreateGroupBody) {
  const { name, prompt } = createGroupBody.parse(body);
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");

  await prisma.group.create({
    data: { name, prompt, userId: session.user.id },
  });

  revalidatePath("/groups");
}

export async function createNewsletterGroupAction(body: CreateGroupBody) {
  const { name } = createGroupBody.parse(body);
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");

  const gmail = getGmailClient(session);
  const token = await getGmailAccessToken(session);
  const newsletters = await findNewsletters(gmail, token.token!);

  const group = await prisma.group.create({
    data: {
      name,
      userId: session.user.id,
      items: {
        create: newsletters.map((newsletter) => ({
          type: GroupItemType.FROM,
          value: newsletter,
        })),
      },
    },
  });

  revalidatePath("/groups");

  return { id: group.id };
}

export async function createReceiptGroupAction({ name }: CreateGroupBody) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");

  const gmail = getGmailClient(session);
  const token = await getGmailAccessToken(session);
  const receipts = await findReceipts(gmail, token.token!);

  const group = await prisma.group.create({
    data: {
      name,
      userId: session.user.id,
      items: { create: receipts },
    },
  });

  revalidatePath("/groups");

  return { id: group.id };
}

export async function deleteGroupAction(id: string) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");

  await prisma.group.delete({ where: { id, userId: session.user.id } });

  revalidatePath("/groups");
}

export async function addGroupItemAction(body: AddGroupItemBody) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");

  await prisma.groupItem.create({ data: addGroupItemBody.parse(body) });
}

export async function deleteGroupItemAction(id: string) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");

  await prisma.groupItem.delete({
    where: { id, group: { userId: session.user.id } },
  });
}

export async function createAutomationAction(prompt: string) {
  const session = await auth();
  if (!session?.user.email) throw new Error("Not logged in");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { aiProvider: true, aiModel: true, openAIApiKey: true },
  });

  const result = await aiCreateRule(prompt, user, session.user.email);

  if (!result) throw new Error("No result");

  let groupId: string | null = null;

  if (result.group) {
    const groups = await prisma.group.findMany({
      where: { userId: session.user.id },
      select: { id: true, name: true, rule: true },
    });

    if (result.group === "Newsletters") {
      const newsletterGroup = groups.find((g) =>
        g.name.toLowerCase().includes("newsletter"),
      );
      if (newsletterGroup) {
        if (newsletterGroup.rule) {
          return {
            error: "Newsletter group already has a rule",
            existingRuleId: newsletterGroup.rule.id,
          };
        }

        groupId = newsletterGroup.id;
      } else {
        const group = await createNewsletterGroupAction({
          name: "Newsletters",
        });
        groupId = group.id;
      }
    } else if (result.group === "Receipts") {
      const receiptsGroup = groups.find((g) =>
        g.name.toLowerCase().includes("receipt"),
      );

      if (receiptsGroup) {
        groupId = receiptsGroup.id;

        if (receiptsGroup.rule) {
          return {
            error: "Receipt group already has a rule",
            existingRuleId: receiptsGroup.rule.id,
          };
        }
      } else {
        const group = await createReceiptGroupAction({ name: "Receipts" });
        groupId = group.id;
      }
    }
  }

  function getRuleType() {
    if (
      result?.staticConditions?.from ||
      result?.staticConditions?.to ||
      result?.staticConditions?.subject
    )
      return RuleType.STATIC;
    if (result?.group) return RuleType.GROUP;
    return RuleType.AI;
  }

  async function createRule(
    result: NonNullable<Awaited<ReturnType<typeof aiCreateRule>>>,
    userId: string,
  ) {
    const rule = await prisma.rule.create({
      data: {
        name: result.name,
        instructions: prompt,
        userId,
        type: getRuleType(), // TODO might want to set this to AI if "requiresAI" is true
        actions: {
          createMany: {
            data: result.actions,
          },
        },
        automate: false,
        runOnThreads: false,
        from: result.staticConditions?.from,
        to: result.staticConditions?.to,
        subject: result.staticConditions?.subject,
        groupId,
      },
    });
    return rule;
  }

  try {
    const rule = await createRule(result, session.user.id);
    return { id: rule.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (
        error.code === "P2002" &&
        (error.meta?.target as string[])?.includes?.("name")
      ) {
        // if rule name already exists, create a new rule with a unique name
        const rule = await createRule(
          { ...result, name: result.name + " - " + Date.now() },
          session.user.id,
        );
        return { id: rule.id };
      }
    }
    throw error;
  }
}

export async function deleteRuleAction(ruleId: string) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");

  await deleteRule({ ruleId }, session.user.id);
}

export async function setRuleAutomatedAction(
  ruleId: string,
  automate: boolean,
) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");

  await prisma.rule.update({
    where: { id: ruleId, userId: session.user.id },
    data: { automate },
  });
}

export async function setRuleRunOnThreadsAction(
  ruleId: string,
  runOnThreads: boolean,
) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");

  await prisma.rule.update({
    where: { id: ruleId, userId: session.user.id },
    data: { runOnThreads },
  });
}
