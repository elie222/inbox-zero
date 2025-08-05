// based on: https://github.com/vercel/platforms/blob/main/lib/auth.ts
import { betterAuth } from "better-auth";
import type { Account, User } from "better-auth";

import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { env } from "@/env";
import { SCOPES as GMAIL_SCOPES } from "@/utils/gmail/scopes";
import { SCOPES as OUTLOOK_SCOPES } from "@/utils/outlook/scopes";
import prisma from "@/utils/prisma";
import { createContact as createLoopsContact } from "@inboxzero/loops";
import { createContact as createResendContact } from "@inboxzero/resend";
import { trackDubSignUp } from "@/utils/dub";
import { createScopedLogger } from "@/utils/logger";
import { captureException } from "@/utils/error";
import { encryptToken } from "@/utils/encryption";
import { cookies } from "next/headers";
import { updateAccountSeats } from "@/utils/premium/server";
import type { Prisma } from "@prisma/client";
import { getContactsClient as getGoogleContactsClient } from "@/utils/gmail/client";
import { getContactsClient as getOutlookContactsClient } from "@/utils/outlook/client";

const logger = createScopedLogger("auth");

export const auth = betterAuth({
  secret: process.env.NEXTAUTH_SECRET,
  emailAndPassword: {
    enabled: false,
  },
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  plugins: [nextCookies()],
  user: {
    modelName: "User",
    fields: {
      name: "name",
      email: "email",
      emailVerified: "emailVerified",
      image: "image",
      createdAt: "createdAt",
      updatedAt: "updatedAt",
    },
  },
  session: {
    modelName: "Session",
    fields: {
      userId: "userId",
      token: "sessionToken",
      expiresAt: "expires",
    },
  },
  account: {
    modelName: "Account",
    fields: {
      userId: "userId",
      accountId: "providerAccountId",
      providerId: "provider",
      refreshToken: "refresh_token",
      accessToken: "access_token",
      accessTokenExpiresAt: "expires_at",
      scope: "scope",
      idToken: "id_token",
      createdAt: "createdAt",
      updatedAt: "updatedAt",
    },
  },
  verification: {
    modelName: "VerificationToken",
    fields: {
      identifier: "identifier",
      value: "token",
      expiresAt: "expires",
    },
  },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID!,
      clientSecret: env.GOOGLE_CLIENT_SECRET!,
      scope: [...GMAIL_SCOPES],
      accessType: "offline",
      prompt: "select_account+consent",
      redirectURI: `${env.NEXT_PUBLIC_BASE_URL}/api/auth/callback/google`,
    },
    microsoft: {
      clientId: env.MICROSOFT_CLIENT_ID!,
      clientSecret: env.MICROSOFT_CLIENT_SECRET!,
      scope: [...OUTLOOK_SCOPES],
      tenantId: "common",
      prompt: "consent",
      redirectURI: `${env.NEXT_PUBLIC_BASE_URL}/api/auth/callback/microsoft-entra-id`,
    },
  },
  events: {
    signIn: handleSignIn,
  },
  databaseHooks: {
    account: {
      create: {
        after: async (account: Account) => {
          logger.info("Debug: Better Auth created account", {
            accountId: account.accountId,
            providerId: account.providerId,
            userId: account.userId,
          });

          await handleLinkAccount(account);
        },
      },
    },
  },
  onAPIError: {
    throw: true,
    onError: (error, ctx) => {
      logger.error("Auth error:", { error, ctx });
    },
    errorURL: "/login",
  },
});
async function handleSignIn({
  user,
  isNewUser,
}: {
  user: User;
  isNewUser: boolean;
}) {
  if (isNewUser && user.email) {
    const [loopsResult, resendResult, dubResult] = await Promise.allSettled([
      createLoopsContact(user.email, user.name?.split(" ")?.[0]),
      createResendContact({ email: user.email }),
      trackDubSignUp(user),
    ]);

    if (loopsResult.status === "rejected") {
      const alreadyExists =
        loopsResult.reason instanceof Error &&
        loopsResult.reason.message.includes("409");

      if (!alreadyExists) {
        logger.error("Error creating Loops contact", {
          email: user.email,
          error: loopsResult.reason,
        });
        captureException(loopsResult.reason, undefined, user.email);
      }
    }

    if (resendResult.status === "rejected") {
      logger.error("Error creating Resend contact", {
        email: user.email,
        error: resendResult.reason,
      });
      captureException(resendResult.reason, undefined, user.email);
    }

    if (dubResult.status === "rejected") {
      logger.error("Error tracking Dub sign up", {
        email: user.email,
        error: dubResult.reason,
      });
      captureException(dubResult.reason, undefined, user.email);
    }
  }

  if (isNewUser && user.email && user.id) {
    await Promise.all([
      handlePendingPremiumInvite({ email: user.email }),
      handleReferralOnSignUp({
        userId: user.id,
        email: user.email,
      }),
    ]);
  }
}
async function handlePendingPremiumInvite({ email }: { email: string }) {
  logger.info("Handling pending premium invite", { email });

  // Check for pending invite
  const premium = await prisma.premium.findFirst({
    where: { pendingInvites: { has: email } },
    select: {
      id: true,
      pendingInvites: true,
      lemonSqueezySubscriptionItemId: true,
      stripeSubscriptionId: true,
      _count: { select: { users: true } },
    },
  });

  if (
    premium?.lemonSqueezySubscriptionItemId ||
    premium?.stripeSubscriptionId
  ) {
    // Add user to premium and remove from pending invites
    await prisma.premium.update({
      where: { id: premium.id },
      data: {
        users: { connect: { email } },
        pendingInvites: {
          set: premium.pendingInvites.filter((e: string) => e !== email),
        },
      },
    });
  }

  logger.info("Added user to premium from invite", { email });
}

export async function handleReferralOnSignUp({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  try {
    const cookieStore = await cookies();
    const referralCookie = cookieStore.get("referral_code");

    if (!referralCookie?.value) {
      logger.info("No referral code found in cookies", { email });
      return;
    }

    const referralCode = referralCookie.value;
    logger.info("Processing referral for new user", {
      email,
      referralCode,
    });

    // Import the createReferral function
    const { createReferral } = await import("@/utils/referral/referral-code");
    await createReferral(userId, referralCode);
    logger.info("Successfully created referral", {
      email,
      referralCode,
    });
  } catch (error) {
    logger.error("Error processing referral on sign up", {
      error,
      userId,
      email,
    });
    // Don't throw error - referral failure shouldn't prevent sign up
    captureException(error, {
      extra: { userId, email, location: "handleReferralOnSignUp" },
    });
  }
}

async function getProfileData(providerId: string, accessToken: string) {
  if (providerId === "google") {
    const contactsClient = getGoogleContactsClient({ accessToken });
    const profileResponse = await contactsClient.people.get({
      resourceName: "people/me",
      personFields: "emailAddresses,names,photos",
    });

    return {
      email: profileResponse.data.emailAddresses
        ?.find((e) => e.metadata?.primary)
        ?.value?.toLowerCase(),
      name: profileResponse.data.names?.find((n) => n.metadata?.primary)
        ?.displayName,
      image: profileResponse.data.photos?.find((p) => p.metadata?.primary)?.url,
    };
  }

  if (providerId === "microsoft") {
    const client = getOutlookContactsClient({ accessToken });
    try {
      const profileResponse = await client.getUserProfile();

      // Get photo separately as it requires a different endpoint
      let photoUrl = null;
      try {
        const photo = await client.getUserPhoto();
        if (photo) {
          photoUrl = photo;
        }
      } catch (error) {
        logger.info("User has no profile photo", { error });
      }

      return {
        email:
          profileResponse.mail?.toLowerCase() ||
          profileResponse.userPrincipalName?.toLowerCase(),
        name: profileResponse.displayName,
        image: photoUrl,
      };
    } catch (error) {
      logger.error("Error fetching Microsoft profile data", { error });
      throw error;
    }
  }
}

async function handleLinkAccount(account: Account) {
  let primaryEmail: string | null | undefined;
  let primaryName: string | null | undefined;
  let primaryPhotoUrl: string | null | undefined;

  try {
    if (!account.accessToken) {
      logger.error(
        "[linkAccount] No access_token found in data, cannot fetch profile.",
      );
      throw new Error("Missing access token during account linking.");
    }

    const profileData = await getProfileData(
      account.providerId,
      account.accessToken,
    );

    if (!profileData?.email) {
      logger.error("[handleLinkAccount] No email found in profile data");
    }

    primaryEmail = profileData?.email;
    primaryName = profileData?.name;
    primaryPhotoUrl = profileData?.image;

    if (!primaryEmail) {
      logger.error(
        "[linkAccount] Primary email could not be determined from profile.",
      );
      throw new Error("Primary email not found for linked account.");
    }

    const user = await prisma.user.findUnique({
      where: { id: account.userId },
      select: { email: true, name: true, image: true },
    });

    if (!user?.email) {
      logger.error("[handleLinkAccount] No user email found", {
        userId: account.userId,
      });
      return;
    }

    // --- Create/Update the corresponding EmailAccount record ---
    const emailAccountData: Prisma.EmailAccountUpsertArgs = {
      where: { email: profileData?.email },
      update: {
        userId: account.userId,
        accountId: account.id,
        name: primaryName,
        image: primaryPhotoUrl,
      },
      create: {
        email: primaryEmail,
        userId: account.userId,
        accountId: account.id,
        name: primaryName,
        image: primaryPhotoUrl,
      },
    };
    await prisma.emailAccount.upsert(emailAccountData);

    // Handle premium account seats
    await updateAccountSeats({ userId: account.userId }).catch((error) => {
      logger.error(
        "[handleLinkAccount] Error updating premium account seats:",
        {
          userId: account.userId,
          error,
        },
      );
      captureException(error, { extra: { userId: account.userId } });
    });

    logger.info("[handleLinkAccount] Successfully linked account", {
      email: user.email,
      userId: account.userId,
      accountId: account.id,
    });
  } catch (error) {
    logger.error("[handleLinkAccount] Error during linking process:", {
      userId: account.userId,
      error,
    });
    captureException(error, {
      extra: { userId: account.userId, location: "linkAccount" },
    });
    throw error;
  }
}

// Function to save refreshed tokens (compatible with existing structure)
export async function saveTokens({
  tokens,
  accountRefreshToken,
  emailAccountId,
  provider,
}: {
  tokens: {
    access_token?: string;
    expires_at?: number;
  };
  accountRefreshToken: string;
  emailAccountId: string;
  provider: "google" | "microsoft";
}) {
  const account = await prisma.account.findUnique({
    where: { id: emailAccountId },
  });

  if (!account) {
    logger.error("Account not found for token save", { emailAccountId });
    return;
  }

  const updatedAccount = await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: tokens.access_token
        ? encryptToken(tokens.access_token)
        : account.access_token,
      expires_at: tokens.expires_at
        ? new Date(tokens.expires_at * 1000)
        : account.expires_at,
      refresh_token: accountRefreshToken,
    },
  });

  logger.info("Tokens saved for account", {
    emailAccountId,
    provider,
    updatedAccount: updatedAccount.id,
  });
}
