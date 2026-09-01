import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { SafeError } from "@/utils/error";
import { auth } from "@/utils/auth";
import {
  getRemainingUnsubscribeCredits,
  isPremiumRecord,
  premiumEntitlementSelect,
} from "@/utils/premium";
import {
  billingAccessPremiumSelect,
  canManageBilling,
  organizationBillingPrincipalsSelect,
} from "@/utils/premium/billing-access";

export type UserResponse = Awaited<ReturnType<typeof getUser>> | null;

async function getUser({
  userId,
  includeImage,
}: {
  userId: string;
  includeImage: boolean;
}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      createdAt: true,
      aiProvider: true,
      aiModel: true,
      aiApiKey: true,
      webhookSecret: true,
      announcementDismissedAt: true,
      dismissedHints: true,
      premium: {
        select: {
          ...billingAccessPremiumSelect,
          ...premiumEntitlementSelect,
          lemonSqueezyCustomerId: true,
          lemonSqueezySubscriptionId: true,
          stripeCustomerId: true,
          stripePriceId: true,
          stripeSubscriptionId: true,
          stripeInvoiceEmailsEnabled: true,
          unsubscribeCredits: true,
          unsubscribeMonth: true,
          emailAccountsAccess: true,
          lemonLicenseKey: true,
          pendingInvites: true,
        },
      },
      emailAccounts: {
        select: {
          id: true,
          email: true,
          name: true,
          ...(includeImage && { image: true }),
          members: {
            select: {
              organizationId: true,
              role: true,
              organization: {
                select: {
                  ...organizationBillingPrincipalsSelect,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user) throw new SafeError("User not found");

  const members = user.emailAccounts.flatMap((account) =>
    account.members.map(({ organizationId, role, organization }) => ({
      organizationId,
      role,
      organization: { name: organization.name },
      emailAccountId: account.id,
    })),
  );

  const { aiApiKey, webhookSecret, emailAccounts } = user;
  const canManageBillingAccess = canManageBilling(user.id, user);
  let premium = null;
  if (user.premium) {
    const { admins: _admins, id: _premiumId, ...premiumData } = user.premium;
    premium = {
      ...premiumData,
      isAdmin: canManageBillingAccess,
    };
  }

  return {
    id: user.id,
    createdAt: user.createdAt,
    aiProvider: user.aiProvider,
    aiModel: user.aiModel,
    announcementDismissedAt: user.announcementDismissedAt,
    dismissedHints: user.dismissedHints,
    premium,
    isPremium: isPremiumRecord(user.premium),
    // Resolved here so the client never compares periods against its own clock.
    unsubscribeCreditsRemaining: getRemainingUnsubscribeCredits(
      user.premium ?? {},
    ),
    emailAccounts: emailAccounts.map(({ members: _members, ...account }) => ({
      ...account,
    })),
    hasAiApiKey: !!aiApiKey,
    hasWebhookSecret: !!webhookSecret,
    canManageBilling: canManageBillingAccess,
    members,
  };
}

// Not using withAuth — unauthenticated requests return 401 with isKnownError
// so the client can distinguish "not logged in" from real errors without Sentry noise
export const GET = withError("user/me", async (request) => {
  const session = await auth(request.headers);
  const userId = session?.user.id;
  if (!userId)
    return NextResponse.json(
      { error: "Not authenticated", isKnownError: true },
      { status: 401 },
    );

  const includeImage =
    request.nextUrl.searchParams.get("includeImage") === "true";

  const user = await getUser({ userId, includeImage });

  return NextResponse.json(user);
});
