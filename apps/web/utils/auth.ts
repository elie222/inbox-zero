// based on: https://github.com/vercel/platforms/blob/main/lib/auth.ts
import { betterAuth } from "better-auth";
import type { Account, User, AuthContext } from "better-auth";

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
import { cookies, headers } from "next/headers";
import { updateAccountSeats } from "@/utils/premium/server";
import type { Prisma } from "@prisma/client";
import { getContactsClient as getGoogleContactsClient } from "@/utils/gmail/client";
import { getContactsClient as getOutlookContactsClient } from "@/utils/outlook/client";

const logger = createScopedLogger("auth");

export const betterAuthConfig = betterAuth({
  advanced: {
    database: {
      generateId: false,
    },
  },
  logger: {
    level: "info",
    log: (level, message, ...args) => {
      switch (level) {
        case "info":
          logger.info(message, { args });
          break;
        case "error":
          logger.error(message, { args });
          break;
      }
    },
  },
  baseURL: env.NEXT_PUBLIC_BASE_URL,
  trustedOrigins: [env.NEXT_PUBLIC_BASE_URL],
  secret: env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: false,
  },
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  plugins: [nextCookies()],
  session: {
    modelName: "Session",
    fields: {
      token: "sessionToken",
      expiresAt: "expires",
    },
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24 * 30, // 30 days
    },
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24 * 3, // 1 day (every 1 day the session expiration is updated)
  },
  account: {
    modelName: "Account",
    fields: {
      accountId: "providerAccountId",
      providerId: "provider",
      refreshToken: "refresh_token",
      accessToken: "access_token",
      accessTokenExpiresAt: "expires_at",
      idToken: "id_token",
    },
  },
  verification: {
    modelName: "VerificationToken",
    fields: {
      value: "token",
      expiresAt: "expires",
    },
  },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      scope: [...GMAIL_SCOPES],
      accessType: "offline",
      prompt: "select_account+consent",
      disableIdTokenSignIn: true,
    },
    microsoft: {
      clientId: env.MICROSOFT_CLIENT_ID || "",
      clientSecret: env.MICROSOFT_CLIENT_SECRET || "",
      scope: [...OUTLOOK_SCOPES],
      tenantId: "common",
      prompt: "consent",
      disableIdTokenSignIn: true,
    },
  },
  events: {
    signIn: handleSignIn,
  },
  databaseHooks: {
    account: {
      create: {
        after: async (account: Account) => {
          await handleLinkAccount(account);
        },
      },
      update: {
        after: async (account: Account) => {
          await handleLinkAccount(account);
        },
      },
    },
  },
  onAPIError: {
    throw: true,
    onError: (error: unknown, ctx: AuthContext) => {
      logger.error("Auth API encountered an error", { error, ctx });
    },
    errorURL: "/login/error",
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
      logger.error("[linkAccount] No user email found", {
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
      logger.error("[linkAccount] Error updating premium account seats:", {
        userId: account.userId,
        error,
      });
      captureException(error, { extra: { userId: account.userId } });
    });

    logger.info("[linkAccount] Successfully linked account", {
      email: user.email,
      userId: account.userId,
      accountId: account.id,
    });
  } catch (error) {
    logger.error("[linkAccount] Error during linking process:", {
      userId: account.userId,
      error,
    });
    captureException(error, {
      extra: { userId: account.userId, location: "linkAccount" },
    });
    throw error;
  }
}

export async function saveTokens({
  tokens,
  accountRefreshToken,
  providerAccountId,
  emailAccountId,
  provider,
}: {
  tokens: {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
  };
  accountRefreshToken: string | null;
  provider: string;
} & ( // provide one of these:
  | {
      providerAccountId: string;
      emailAccountId?: never;
    }
  | {
      emailAccountId: string;
      providerAccountId?: never;
    }
)) {
  const refreshToken = tokens.refresh_token ?? accountRefreshToken;

  if (!refreshToken) {
    logger.error("Attempted to save null refresh token", { providerAccountId });
    captureException("Cannot save null refresh token", {
      extra: { providerAccountId },
    });
    return;
  }

  const data = {
    access_token: tokens.access_token,
    expires_at: tokens.expires_at ? new Date(tokens.expires_at * 1000) : null,
    refresh_token: refreshToken,
  };

  if (emailAccountId) {
    // Encrypt tokens in data directly
    // Usually we do this in prisma-extensions.ts but we need to do it here because we're updating the account via the emailAccount
    // We could also edit prisma-extensions.ts to handle this case but this is easier for now
    if (data.access_token)
      data.access_token = encryptToken(data.access_token) || undefined;
    if (data.refresh_token)
      data.refresh_token = encryptToken(data.refresh_token) || "";

    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { account: { update: data } },
    });
  } else {
    if (!providerAccountId) {
      logger.error("No providerAccountId found in database", {
        emailAccountId,
      });
      captureException("No providerAccountId found in database", {
        extra: { emailAccountId },
      });
      return;
    }

    return await prisma.account.update({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId,
        },
      },
      data,
    });
  }
}

export const auth = async () =>
  betterAuthConfig.api.getSession({ headers: await headers() });
