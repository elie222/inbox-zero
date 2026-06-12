import prisma from "@/utils/prisma";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Prisma } from "@/generated/prisma/client";
import type { DraftReplyConfidence } from "@/generated/prisma/enums";
import { env } from "@/env";
import { getEffectiveAiSettings } from "@/utils/organizations/ai-settings";

export type EmailAccountWithAIAndTokens = Prisma.EmailAccountGetPayload<{
  select: {
    id: true;
    userId: true;
    email: true;
    about: true;
    multiRuleSelectionEnabled: true;
    sensitiveDataPolicy: true;
    timezone: true;
    calendarBookingLink: true;
    user: {
      select: {
        aiProvider: true;
        aiModel: true;
        aiApiKey: true;
      };
    };
    account: {
      select: {
        access_token: true;
        refresh_token: true;
        expires_at: true;
        provider: true;
      };
    };
  };
}> & {
  tokens: {
    access_token: string | null;
    refresh_token: string | null;
    expires_at: number | null;
  };
};

export async function getEmailAccountWithAi({
  emailAccountId,
}: {
  emailAccountId: string;
}): Promise<(EmailAccountWithAI & { name: string | null }) | null> {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      id: true,
      userId: true,
      email: true,
      about: true,
      multiRuleSelectionEnabled: true,
      sensitiveDataPolicy: true,
      timezone: true,
      calendarBookingLink: true,
      name: true,
      user: {
        select: {
          aiProvider: true,
          aiModel: true,
          aiApiKey: true,
        },
      },
      members: {
        take: 1,
        select: {
          organizationId: true,
        },
      },
      account: {
        select: {
          provider: true,
        },
      },
    },
  });

  if (!emailAccount) {
    return null;
  }

  const effectiveAiSettings = await getEffectiveAiSettings({
    userAiSettings: emailAccount.user,
    organizationId: emailAccount.members[0]?.organizationId,
    excludeUserId: emailAccount.userId,
  });

  const { members: _members, ...accountWithoutMembers } = emailAccount;

  return {
    ...accountWithoutMembers,
    user: effectiveAiSettings,
  };
}

export type EmailAccountForRuleExecution = EmailAccountWithAI & {
  name: string | null;
  draftReplyConfidence: DraftReplyConfidence;
};

export async function getEmailAccountForRuleExecution({
  emailAccountId,
}: {
  emailAccountId: string;
}): Promise<EmailAccountForRuleExecution | null> {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      id: true,
      userId: true,
      email: true,
      about: true,
      multiRuleSelectionEnabled: true,
      sensitiveDataPolicy: true,
      timezone: true,
      calendarBookingLink: true,
      name: true,
      draftReplyConfidence: true,
      user: {
        select: {
          aiProvider: true,
          aiModel: true,
          aiApiKey: true,
        },
      },
      members: {
        take: 1,
        select: {
          organizationId: true,
        },
      },
      account: {
        select: {
          provider: true,
        },
      },
    },
  });

  if (!emailAccount) {
    return null;
  }

  const effectiveAiSettings = await getEffectiveAiSettings({
    userAiSettings: emailAccount.user,
    organizationId: emailAccount.members[0]?.organizationId,
    excludeUserId: emailAccount.userId,
  });

  const { members: _members, ...accountWithoutMembers } = emailAccount;

  return {
    ...accountWithoutMembers,
    user: effectiveAiSettings,
  };
}

export async function getEmailAccountWithAiAndTokens({
  emailAccountId,
}: {
  emailAccountId: string;
}): Promise<EmailAccountWithAIAndTokens | null> {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      id: true,
      userId: true,
      email: true,
      about: true,
      multiRuleSelectionEnabled: true,
      sensitiveDataPolicy: true,
      timezone: true,
      calendarBookingLink: true,
      user: {
        select: {
          aiProvider: true,
          aiModel: true,
          aiApiKey: true,
        },
      },
      members: {
        take: 1,
        select: {
          organizationId: true,
        },
      },
      account: {
        select: {
          access_token: true,
          refresh_token: true,
          expires_at: true,
          provider: true,
        },
      },
    },
  });

  if (!emailAccount) return null;

  const effectiveAiSettings = await getEffectiveAiSettings({
    userAiSettings: emailAccount.user,
    organizationId: emailAccount.members[0]?.organizationId,
    excludeUserId: emailAccount.userId,
  });

  const { members: _members, ...accountWithoutMembers } = emailAccount;

  return {
    ...accountWithoutMembers,
    user: effectiveAiSettings,
    tokens: {
      ...accountWithoutMembers.account,
      expires_at: accountWithoutMembers.account.expires_at?.getTime() ?? null,
    },
  };
}

export async function getUserPremium({ userId }: { userId: string }) {
  if (env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS) {
    return { lemonSqueezyRenewsAt: null, stripeSubscriptionStatus: "active" };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { premium: true },
  });

  return user?.premium || null;
}

export async function getWritingStyle({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const writingStyle = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { writingStyle: true },
  });

  return writingStyle?.writingStyle || null;
}
