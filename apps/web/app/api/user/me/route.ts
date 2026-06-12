import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { SafeError } from "@/utils/error";
import { auth } from "@/utils/auth";
import { premiumEntitlementSelect } from "@/utils/premium";
import { getEffectiveAiSettings } from "@/utils/organizations/ai-settings";

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
          ...premiumEntitlementSelect,
          lemonSqueezyCustomerId: true,
          lemonSqueezySubscriptionId: true,
          stripeCustomerId: true,
          stripePriceId: true,
          stripeSubscriptionId: true,
          unsubscribeCredits: true,
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
    account.members.map((member) => ({
      ...member,
      emailAccountId: account.id,
    })),
  );

  const { aiApiKey, webhookSecret, emailAccounts } = user;
  const effectiveAiSettings = await getEffectiveAiSettings({
    userAiSettings: {
      aiProvider: user.aiProvider,
      aiModel: user.aiModel,
      aiApiKey,
    },
    organizationId: members[0]?.organizationId,
    excludeUserId: user.id,
  });

  return {
    id: user.id,
    createdAt: user.createdAt,
    aiProvider: effectiveAiSettings.aiProvider,
    aiModel: effectiveAiSettings.aiModel,
    announcementDismissedAt: user.announcementDismissedAt,
    dismissedHints: user.dismissedHints,
    premium: user.premium,
    emailAccounts: emailAccounts.map(({ members: _members, ...account }) => ({
      ...account,
    })),
    hasAiApiKey: !!effectiveAiSettings.aiApiKey,
    hasWebhookSecret: !!webhookSecret,
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
